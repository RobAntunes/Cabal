package main

import (
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/charmbracelet/bubbles/list"
	"github.com/charmbracelet/bubbles/spinner"
	"github.com/charmbracelet/bubbles/textarea"
	"github.com/charmbracelet/bubbles/viewport"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/glamour"
	"github.com/charmbracelet/lipgloss"
)

// Styles
var (
	titleStyle = lipgloss.NewStyle().
			Bold(true).
			Foreground(lipgloss.Color("99")).
			PaddingLeft(2)

	activeStyle = lipgloss.NewStyle().
			Border(lipgloss.RoundedBorder()).
			BorderForeground(lipgloss.Color("62"))

	inactiveStyle = lipgloss.NewStyle().
			Border(lipgloss.RoundedBorder()).
			BorderForeground(lipgloss.Color("240"))

	statusStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("241"))

	agentStyle = lipgloss.NewStyle().
			Bold(true).
			Foreground(lipgloss.Color("212"))
)

type message struct {
	content  string
	isAgent  bool
	markdown bool
}

type agent struct {
	id       string
	name     string
	status   string
	messages []message
}

func (a agent) FilterValue() string { return a.name }
func (a agent) Title() string       { return a.name }
func (a agent) Description() string { return fmt.Sprintf("Status: %s", a.status) }

type model struct {
	agents      []agent
	agentList   list.Model
	viewports   map[string]viewport.Model
	input       textarea.Model
	spinner     spinner.Model
	renderer    *glamour.TermRenderer
	activeAgent int
	width       int
	height      int
	ready       bool
}

func initialModel() model {
	// Create sample agents
	agents := []agent{
		{id: "agent-0", name: "Agent Alpha", status: "ready", messages: []message{{content: "Initialized", isAgent: true}}},
		{id: "agent-1", name: "Agent Beta", status: "ready", messages: []message{{content: "Initialized", isAgent: true}}},
		{id: "agent-2", name: "Agent Gamma", status: "ready", messages: []message{{content: "Initialized", isAgent: true}}},
	}

	// Create agent list
	items := make([]list.Item, len(agents))
	for i, a := range agents {
		items[i] = a
	}

	l := list.New(items, list.NewDefaultDelegate(), 0, 0)
	l.Title = "Active Agents"
	l.SetShowStatusBar(false)
	l.SetFilteringEnabled(false)

	// Create glamour renderer
	renderer, _ := glamour.NewTermRenderer(
		glamour.WithAutoStyle(),
		glamour.WithWordWrap(80),
	)

	// Create viewports for each agent
	viewports := make(map[string]viewport.Model)
	for _, a := range agents {
		vp := viewport.New(0, 0)
		content := renderMessages(a.messages, renderer)
		vp.SetContent(content)
		viewports[a.id] = vp
	}

	// Create input textarea
	ta := textarea.New()
	ta.Placeholder = "Send message to agent..."
	ta.Focus()
	ta.CharLimit = 500

	// Create spinner
	s := spinner.New()
	s.Spinner = spinner.Dot
	s.Style = lipgloss.NewStyle().Foreground(lipgloss.Color("205"))

	return model{
		agents:      agents,
		agentList:   l,
		viewports:   viewports,
		input:       ta,
		spinner:     s,
		renderer:    renderer,
		activeAgent: 0,
	}
}

func (m model) Init() tea.Cmd {
	return tea.Batch(
		m.spinner.Tick,
		textarea.Blink,
	)
}

func (m model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	var cmds []tea.Cmd

	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height

		// Update component sizes
		listWidth := m.width / 4
		m.agentList.SetSize(listWidth, m.height-3)

		// Update viewport sizes
		vpWidth := (m.width - listWidth - 4) / 2
		vpHeight := (m.height - 10) / 2

		for id, vp := range m.viewports {
			vp.Width = vpWidth
			vp.Height = vpHeight
			m.viewports[id] = vp
		}

		// Update input size
		m.input.SetWidth(m.width - listWidth - 4)
		m.input.SetHeight(3)

		m.ready = true

	case tea.KeyMsg:
		switch msg.Type {
		case tea.KeyCtrlC, tea.KeyEsc:
			return m, tea.Quit
		case tea.KeyTab:
			// Switch active agent
			m.activeAgent = (m.activeAgent + 1) % len(m.agents)
			m.agentList.Select(m.activeAgent)
		case tea.KeyEnter:
			// Send message to active agent
			if m.input.Value() != "" {
				agent := &m.agents[m.activeAgent]
				agent.messages = append(agent.messages, message{
					content: m.input.Value(),
					isAgent: false,
				})
				agent.status = "processing"
				
				// Update viewport
				vp := m.viewports[agent.id]
				vp.SetContent(renderMessages(agent.messages, m.renderer))
				m.viewports[agent.id] = vp
				
				m.input.Reset()
				
				// Simulate response after delay
				cmds = append(cmds, simulateResponse(m.activeAgent))
			}
		}

	case responseMsg:
		// Handle simulated response
		if msg.agentIndex < len(m.agents) {
			agent := &m.agents[msg.agentIndex]
			agent.messages = append(agent.messages, message{
				content:  msg.response,
				isAgent:  true,
				markdown: true,
			})
			agent.status = "ready"
			
			// Update viewport
			vp := m.viewports[agent.id]
			vp.SetContent(renderMessages(agent.messages, m.renderer))
			vp.GotoBottom()
			m.viewports[agent.id] = vp
		}

	case spinner.TickMsg:
		var cmd tea.Cmd
		m.spinner, cmd = m.spinner.Update(msg)
		cmds = append(cmds, cmd)
	}

	// Update components
	var cmd tea.Cmd
	m.agentList, cmd = m.agentList.Update(msg)
	cmds = append(cmds, cmd)

	m.input, cmd = m.input.Update(msg)
	cmds = append(cmds, cmd)

	// Update active viewport
	if m.activeAgent < len(m.agents) {
		agentID := m.agents[m.activeAgent].id
		vp := m.viewports[agentID]
		vp, cmd = vp.Update(msg)
		m.viewports[agentID] = vp
		cmds = append(cmds, cmd)
	}

	return m, tea.Batch(cmds...)
}

func (m model) View() string {
	if !m.ready {
		return "Loading..."
	}

	// Left panel - agent list
	listStyle := inactiveStyle.
		Width(m.width / 4).
		Height(m.height - 3)
	leftPanel := listStyle.Render(m.agentList.View())

	// Right panel - agent views
	rightWidth := m.width - m.width/4 - 2
	
	// Title
	title := titleStyle.Render("🤖 CABAL - Multiplexed Claude Agents")
	
	// Agent viewports (2x2 grid)
	vpWidth := rightWidth / 2
	vpHeight := (m.height - 10) / 2
	
	var viewportRows []string
	row1 := []string{}
	row2 := []string{}
	
	for i, agent := range m.agents[:min(4, len(m.agents))] {
		vp := m.viewports[agent.id]
		
		// Style based on active/inactive
		style := inactiveStyle
		if i == m.activeAgent {
			style = activeStyle
		}
		
		vpView := style.
			Width(vpWidth - 2).
			Height(vpHeight).
			Render(fmt.Sprintf("%s %s\n%s", 
				agentStyle.Render(agent.name),
				statusStyle.Render(fmt.Sprintf("(%s)", agent.status)),
				vp.View()))
		
		if i < 2 {
			row1 = append(row1, vpView)
		} else {
			row2 = append(row2, vpView)
		}
	}
	
	viewportRows = append(viewportRows, lipgloss.JoinHorizontal(lipgloss.Top, row1...))
	if len(row2) > 0 {
		viewportRows = append(viewportRows, lipgloss.JoinHorizontal(lipgloss.Top, row2...))
	}
	
	viewports := lipgloss.JoinVertical(lipgloss.Left, viewportRows...)
	
	// Input area
	inputView := activeStyle.
		Width(rightWidth - 2).
		Render(m.input.View())
	
	// Combine right panel
	rightPanel := lipgloss.JoinVertical(
		lipgloss.Left,
		title,
		viewports,
		inputView,
	)
	
	// Status bar
	status := statusStyle.Render(fmt.Sprintf(" %d agents • Tab: switch • Enter: send • Ctrl+C: quit", len(m.agents)))
	
	// Final layout
	main := lipgloss.JoinHorizontal(lipgloss.Top, leftPanel, rightPanel)
	
	return lipgloss.JoinVertical(lipgloss.Left, main, status)
}

// Message types
type responseMsg struct {
	agentIndex int
	response   string
}

// Render messages with glamour for markdown
func renderMessages(messages []message, renderer *glamour.TermRenderer) string {
	var rendered []string
	for _, msg := range messages {
		if msg.markdown && renderer != nil {
			// Render markdown content
			if out, err := renderer.Render(msg.content); err == nil {
				rendered = append(rendered, strings.TrimSpace(out))
			} else {
				rendered = append(rendered, msg.content)
			}
		} else {
			// Plain text
			prefix := "> "
			if msg.isAgent {
				prefix = "< "
			}
			rendered = append(rendered, prefix+msg.content)
		}
	}
	return strings.Join(rendered, "\n\n")
}

// Simulate agent response with markdown
func simulateResponse(agentIndex int) tea.Cmd {
	return func() tea.Msg {
		time.Sleep(2 * time.Second)
		responses := []string{
			"# Analysis Complete\n\nI've processed your request. Here are the key findings:\n\n- **Performance**: Optimal\n- **Status**: All systems operational\n- **Recommendation**: Continue with current approach",
			"## Task Summary\n\nThe following steps were completed:\n\n1. Data collection\n2. Analysis phase\n3. Result compilation\n\n> All tasks completed successfully!",
			"### Code Review\n\n```go\nfunc example() {\n    fmt.Println(\"Hello, World!\")\n}\n```\n\nThe code looks good and follows best practices.",
			"## Insights\n\nBased on the analysis:\n\n* Pattern recognition shows **strong correlation**\n* The data suggests a `positive trend`\n* Further investigation recommended\n\n[View detailed report](#)",
		}
		return responseMsg{
			agentIndex: agentIndex,
			response:   responses[agentIndex%len(responses)],
		}
	}
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func main() {
	p := tea.NewProgram(initialModel(), tea.WithAltScreen())
	if _, err := p.Run(); err != nil {
		log.Fatal(err)
	}
}