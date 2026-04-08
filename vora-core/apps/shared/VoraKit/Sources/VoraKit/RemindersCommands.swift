import Foundation

public enum VoraRemindersCommand: String, Codable, Sendable {
    case list = "reminders.list"
    case add = "reminders.add"
}

public enum VoraReminderStatusFilter: String, Codable, Sendable {
    case incomplete
    case completed
    case all
}

public struct VoraRemindersListParams: Codable, Sendable, Equatable {
    public var status: VoraReminderStatusFilter?
    public var limit: Int?

    public init(status: VoraReminderStatusFilter? = nil, limit: Int? = nil) {
        self.status = status
        self.limit = limit
    }
}

public struct VoraRemindersAddParams: Codable, Sendable, Equatable {
    public var title: String
    public var dueISO: String?
    public var notes: String?
    public var listId: String?
    public var listName: String?

    public init(
        title: String,
        dueISO: String? = nil,
        notes: String? = nil,
        listId: String? = nil,
        listName: String? = nil)
    {
        self.title = title
        self.dueISO = dueISO
        self.notes = notes
        self.listId = listId
        self.listName = listName
    }
}

public struct VoraReminderPayload: Codable, Sendable, Equatable {
    public var identifier: String
    public var title: String
    public var dueISO: String?
    public var completed: Bool
    public var listName: String?

    public init(
        identifier: String,
        title: String,
        dueISO: String? = nil,
        completed: Bool,
        listName: String? = nil)
    {
        self.identifier = identifier
        self.title = title
        self.dueISO = dueISO
        self.completed = completed
        self.listName = listName
    }
}

public struct VoraRemindersListPayload: Codable, Sendable, Equatable {
    public var reminders: [VoraReminderPayload]

    public init(reminders: [VoraReminderPayload]) {
        self.reminders = reminders
    }
}

public struct VoraRemindersAddPayload: Codable, Sendable, Equatable {
    public var reminder: VoraReminderPayload

    public init(reminder: VoraReminderPayload) {
        self.reminder = reminder
    }
}
