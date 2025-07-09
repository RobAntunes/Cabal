package main

import (
	"encoding/json"
	"log"
	"sync"

	"github.com/gorilla/websocket"
)

type WSClient struct {
	conn     *websocket.Conn
	send     chan []byte
	receive  chan WSMessage
	mu       sync.RWMutex
	handlers map[string]func(interface{})
}

type WSMessage struct {
	Type    string      `json:"type"`
	Payload interface{} `json:"payload"`
	ID      string      `json:"id,omitempty"`
}

func NewWSClient(url string) (*WSClient, error) {
	conn, _, err := websocket.DefaultDialer.Dial(url, nil)
	if err != nil {
		return nil, err
	}

	client := &WSClient{
		conn:     conn,
		send:     make(chan []byte, 256),
		receive:  make(chan WSMessage, 256),
		handlers: make(map[string]func(interface{})),
	}

	go client.readPump()
	go client.writePump()

	return client, nil
}

func (c *WSClient) readPump() {
	defer func() {
		c.conn.Close()
	}()

	for {
		var msg WSMessage
		err := c.conn.ReadJSON(&msg)
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("websocket error: %v", err)
			}
			break
		}

		// Call handler if registered
		c.mu.RLock()
		if handler, ok := c.handlers[msg.Type]; ok {
			go handler(msg.Payload)
		}
		c.mu.RUnlock()

		// Also send to receive channel
		select {
		case c.receive <- msg:
		default:
			// Channel full, drop message
		}
	}
}

func (c *WSClient) writePump() {
	defer c.conn.Close()

	for {
		select {
		case message, ok := <-c.send:
			if !ok {
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			c.conn.WriteMessage(websocket.TextMessage, message)
		}
	}
}

func (c *WSClient) Send(msgType string, payload interface{}) error {
	msg := WSMessage{
		Type:    msgType,
		Payload: payload,
	}

	data, err := json.Marshal(msg)
	if err != nil {
		return err
	}

	select {
	case c.send <- data:
		return nil
	default:
		return err
	}
}

func (c *WSClient) On(msgType string, handler func(interface{})) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.handlers[msgType] = handler
}

func (c *WSClient) Close() {
	close(c.send)
	c.conn.Close()
}