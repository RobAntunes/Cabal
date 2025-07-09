package main

import (
	"fmt"
	"strings"

	"github.com/charmbracelet/bubbles/key"
	"github.com/charmbracelet/bubbles/list"
	"github.com/charmbracelet/bubbles/table"
	"github.com/charmbracelet/bubbles/viewport"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

// Tab modes
type tabMode int

const (
	tabAgents tabMode = iota
	tabEvents
	tabWorkflows
	tabAnalytics
)

var tabNames = []string{"Agents", "Events", "Workflows", "Analytics"}

// Styles for control center
var (
	// Tab styles
	activeTabStyle = lipgloss.NewStyle().
			Bold(true).
			Foreground(lipgloss.Color("231")).
			Background(lipgloss.Color("62")).
			Padding(0, 2)

	inactiveTabStyle = lipgloss.NewStyle().
				Foreground(lipgloss.Color("250")).
				Background(lipgloss.Color("238")).
				Padding(0, 2)

	tabBarStyle = lipgloss.NewStyle().
			Background(lipgloss.Color("236"))

	// Content area styles
	contentStyle = lipgloss.NewStyle().
			Border(lipgloss.RoundedBorder()).
			BorderForeground(lipgloss.Color("240")).
			Padding(1)

	// Agent status colors
	onlineStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("46")) // Green

	offlineStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("196")) // Red

	busyStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("214")) // Yellow

	// Stats styles
	statLabelStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("245")).
			Bold(true)

	statValueStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("213"))
)

type controlCenterModel struct {
	activeTab    tabMode
	width        int
	height       int
	ready        bool
	wsClient     *WSClient
	
	// Tab content
	agentTable   table.Model
	eventView    viewport.Model
	workflowList list.Model
	analyticsView viewport.Model
	
	// Data
	agents       []AgentInfo
	events       []EventInfo
	workflows    []WorkflowInfo
	stats        SystemStats
}

type AgentInfo struct {
	ID           string
	Name         string
	Type         string
	Status       string
	Tasks        int
	SuccessRate  float64
	ResponseTime float64
	Capabilities []string
}

type EventInfo struct {
	Timestamp string
	Type      string
	From      string
	To        string
	Message   string
}

type WorkflowInfo struct {
	ID     string
	Name   string
	Status string
	Agents []string
}

type SystemStats struct {
	TotalAgents     int
	OnlineAgents    int
	TasksCompleted  int
	AvgResponseTime float64
	SuccessRate     float64
	EventsPerMinute int
}

func initialControlCenterModel() controlCenterModel {
	// Create agent table
	columns := []table.Column{
		{Title: "Agent", Width: 20},
		{Title: "Type", Width: 12},
		{Title: "Status", Width: 10},
		{Title: "Tasks", Width: 8},
		{Title: "Success", Width: 10},
		{Title: "Avg Time", Width: 10},
		{Title: "Capabilities", Width: 30},
	}
	
	agentTable := table.New(
		table.WithColumns(columns),
		table.WithFocused(true),
		table.WithHeight(10),
	)
	
	// Style the table
	s := table.DefaultStyles()
	s.Header = s.Header.
		BorderStyle(lipgloss.NormalBorder()).
		BorderForeground(lipgloss.Color("240")).
		BorderBottom(true).
		Bold(false)
	s.Selected = s.Selected.
		Foreground(lipgloss.Color("229")).
		Background(lipgloss.Color("57")).
		Bold(false)
	agentTable.SetStyles(s)
	
	// Create other views
	eventView := viewport.New(80, 20)
	workflowList := list.New([]list.Item{}, list.NewDefaultDelegate(), 40, 20)
	analyticsView := viewport.New(80, 20)
	
	return controlCenterModel{
		activeTab:     tabAgents,
		agentTable:    agentTable,
		eventView:     eventView,
		workflowList:  workflowList,
		analyticsView: analyticsView,
		agents:        []AgentInfo{},
		events:        []EventInfo{},
		workflows:     []WorkflowInfo{},
	}
}

func (m controlCenterModel) Init() tea.Cmd {
	return nil
}

func (m controlCenterModel) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	var cmds []tea.Cmd
	
	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height
		m.ready = true
		
		// Update component sizes
		contentHeight := m.height - 6 // Leave room for tabs and status
		contentWidth := m.width - 4
		
		m.agentTable.SetWidth(contentWidth)
		m.agentTable.SetHeight(contentHeight - 4)
		
		m.eventView.Width = contentWidth
		m.eventView.Height = contentHeight
		
		m.workflowList.SetSize(contentWidth, contentHeight)
		
		m.analyticsView.Width = contentWidth
		m.analyticsView.Height = contentHeight
		
	case tea.KeyMsg:
		// Global key handling
		switch msg.String() {
		case "ctrl+c", "q":
			return m, tea.Quit
		case "1", "f1":
			m.activeTab = tabAgents
		case "2", "f2":
			m.activeTab = tabEvents
		case "3", "f3":
			m.activeTab = tabWorkflows
		case "4", "f4":
			m.activeTab = tabAnalytics
		case "tab":
			m.activeTab = (m.activeTab + 1) % 4
		case "shift+tab":
			m.activeTab = (m.activeTab + 3) % 4
		}
		
		// Tab-specific key handling
		switch m.activeTab {
		case tabAgents:
			var cmd tea.Cmd
			m.agentTable, cmd = m.agentTable.Update(msg)
			cmds = append(cmds, cmd)
		case tabEvents:
			var cmd tea.Cmd
			m.eventView, cmd = m.eventView.Update(msg)
			cmds = append(cmds, cmd)
		case tabWorkflows:
			var cmd tea.Cmd
			m.workflowList, cmd = m.workflowList.Update(msg)
			cmds = append(cmds, cmd)
		case tabAnalytics:
			var cmd tea.Cmd
			m.analyticsView, cmd = m.analyticsView.Update(msg)
			cmds = append(cmds, cmd)
		}
		
	// Handle WebSocket messages
	case AgentRegistryUpdate:
		m.agents = msg.Agents
		m.updateAgentTable()
		
	case EventStreamUpdate:
		m.events = append([]EventInfo{msg.Event}, m.events...)
		if len(m.events) > 100 {
			m.events = m.events[:100]
		}
		m.updateEventView()
		
	case SystemStatsUpdate:
		m.stats = msg.Stats
		m.updateAnalyticsView()
	}
	
	return m, tea.Batch(cmds...)
}

func (m controlCenterModel) View() string {
	if !m.ready {
		return "Loading Control Center..."
	}
	
	// Build tab bar
	tabs := make([]string, len(tabNames))
	for i, name := range tabNames {
		style := inactiveTabStyle
		if tabMode(i) == m.activeTab {
			style = activeTabStyle
		}
		tabs[i] = style.Render(fmt.Sprintf(" %s ", name))
	}
	tabBar := tabBarStyle.Width(m.width).Render(
		lipgloss.JoinHorizontal(lipgloss.Top, tabs...),
	)
	
	// Render active tab content
	var content string
	switch m.activeTab {
	case tabAgents:
		content = m.renderAgentsTab()
	case tabEvents:
		content = m.renderEventsTab()
	case tabWorkflows:
		content = m.renderWorkflowsTab()
	case tabAnalytics:
		content = m.renderAnalyticsTab()
	}
	
	// Status bar
	statusBar := m.renderStatusBar()
	
	// Combine everything
	return lipgloss.JoinVertical(
		lipgloss.Left,
		tabBar,
		content,
		statusBar,
	)
}

func (m *controlCenterModel) renderAgentsTab() string {
	title := titleStyle.Render("🤖 Agent Registry")
	
	// Quick stats
	onlineCount := 0
	for _, agent := range m.agents {
		if agent.Status == "online" {
			onlineCount++
		}
	}
	
	stats := fmt.Sprintf(
		"%s %d  %s %d  %s %d",
		statLabelStyle.Render("Total:"),
		len(m.agents),
		statLabelStyle.Render("Online:"),
		onlineCount,
		statLabelStyle.Render("Offline:"),
		len(m.agents)-onlineCount,
	)
	
	content := lipgloss.JoinVertical(
		lipgloss.Left,
		title,
		stats,
		"",
		m.agentTable.View(),
	)
	
	return contentStyle.
		Width(m.width - 4).
		Height(m.height - 6).
		Render(content)
}

func (m *controlCenterModel) renderEventsTab() string {
	title := titleStyle.Render("📡 Live Event Stream")
	
	return contentStyle.
		Width(m.width - 4).
		Height(m.height - 6).
		Render(lipgloss.JoinVertical(
			lipgloss.Left,
			title,
			"",
			m.eventView.View(),
		))
}

func (m *controlCenterModel) renderWorkflowsTab() string {
	title := titleStyle.Render("🔄 Workflows")
	
	return contentStyle.
		Width(m.width - 4).
		Height(m.height - 6).
		Render(lipgloss.JoinVertical(
			lipgloss.Left,
			title,
			"",
			m.workflowList.View(),
		))
}

func (m *controlCenterModel) renderAnalyticsTab() string {
	title := titleStyle.Render("📊 System Analytics")
	
	return contentStyle.
		Width(m.width - 4).
		Height(m.height - 6).
		Render(lipgloss.JoinVertical(
			lipgloss.Left,
			title,
			"",
			m.analyticsView.View(),
		))
}

func (m *controlCenterModel) renderStatusBar() string {
	help := "Tab/F1-F4: Switch • q: Quit"
	
	status := fmt.Sprintf(
		"🟢 %d agents • 📊 %d tasks/min • ⚡ %.2fms avg",
		m.stats.OnlineAgents,
		m.stats.EventsPerMinute,
		m.stats.AvgResponseTime,
	)
	
	width := m.width / 2
	statusSection := statusStyle.Width(width).Align(lipgloss.Left).Render(status)
	helpSection := statusStyle.Width(width).Align(lipgloss.Right).Render(help)
	
	return lipgloss.JoinHorizontal(lipgloss.Top, statusSection, helpSection)
}

func (m *controlCenterModel) updateAgentTable() {
	rows := []table.Row{}
	
	for _, agent := range m.agents {
		// Style status
		var status string
		switch agent.Status {
		case "online":
			status = onlineStyle.Render("● " + agent.Status)
		case "offline":
			status = offlineStyle.Render("● " + agent.Status)
		case "busy":
			status = busyStyle.Render("● " + agent.Status)
		default:
			status = agent.Status
		}
		
		rows = append(rows, table.Row{
			agent.Name,
			agent.Type,
			status,
			fmt.Sprintf("%d", agent.Tasks),
			fmt.Sprintf("%.1f%%", agent.SuccessRate*100),
			fmt.Sprintf("%.0fms", agent.ResponseTime),
			strings.Join(agent.Capabilities, ", "),
		})
	}
	
	m.agentTable.SetRows(rows)
}

func (m *controlCenterModel) updateEventView() {
	var content strings.Builder
	
	for _, event := range m.events {
		line := fmt.Sprintf(
			"%s [%s] %s → %s: %s\n",
			event.Timestamp,
			event.Type,
			event.From,
			event.To,
			event.Message,
		)
		content.WriteString(line)
	}
	
	m.eventView.SetContent(content.String())
}

func (m *controlCenterModel) updateAnalyticsView() {
	content := fmt.Sprintf(`
System Overview
===============

Active Agents:     %d / %d
Tasks Completed:   %d
Success Rate:      %.1f%%
Avg Response Time: %.2fms
Events/Minute:     %d

Performance Trends
==================
[Performance graphs would go here]

Resource Usage
==============
[Resource metrics would go here]
`,
		m.stats.OnlineAgents,
		m.stats.TotalAgents,
		m.stats.TasksCompleted,
		m.stats.SuccessRate*100,
		m.stats.AvgResponseTime,
		m.stats.EventsPerMinute,
	)
	
	m.analyticsView.SetContent(content)
}

// WebSocket message types
type AgentRegistryUpdate struct {
	Agents []AgentInfo
}

type EventStreamUpdate struct {
	Event EventInfo
}

type SystemStatsUpdate struct {
	Stats SystemStats
}

// Key bindings
func (m controlCenterModel) ShortHelp() []key.Binding {
	return []key.Binding{
		key.NewBinding(key.WithKeys("tab"), key.WithHelp("tab", "next")),
		key.NewBinding(key.WithKeys("shift+tab"), key.WithHelp("shift+tab", "prev")),
		key.NewBinding(key.WithKeys("q"), key.WithHelp("q", "quit")),
	}
}