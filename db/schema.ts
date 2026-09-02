import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const employees = sqliteTable("employees", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  role: text("role").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  calendarId: text("calendar_id"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const serviceSettings = sqliteTable("service_settings", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  durationMinutes: integer("duration_minutes").notNull(),
  bufferMinutes: integer("buffer_minutes").notNull().default(0),
  priceLabel: text("price_label").notNull(),
  category: text("category").notNull().default("Styling"),
  description: text("description").notNull().default(""),
  image: text("image"),
  sortOrder: integer("sort_order").notNull().default(0),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at"),
  updatedAt: text("updated_at").notNull(),
});

export const priceListItems = sqliteTable(
  "price_list_items",
  {
    itemId: text("item_id").primaryKey(),
    tableId: text("table_id").notNull(),
    name: text("name"),
    note: text("note"),
    pricesJson: text("prices_json").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    custom: integer("custom", { mode: "boolean" }).notNull().default(false),
    updatedByEmail: text("updated_by_email").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("price_list_items_table_order_idx").on(table.tableId, table.sortOrder),
    index("price_list_items_active_idx").on(table.active),
  ],
);

export const openingHoursSettings = sqliteTable("opening_hours", {
  dayOfWeek: integer("day_of_week").primaryKey(),
  openTime: text("open_time"),
  closeTime: text("close_time"),
  closed: integer("closed", { mode: "boolean" }).notNull().default(false),
  updatedAt: text("updated_at").notNull(),
});

export const employeeServices = sqliteTable(
  "employee_services",
  {
    employeeId: text("employee_id").notNull(),
    serviceId: text("service_id").notNull(),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
  },
  (table) => [primaryKey({ columns: [table.employeeId, table.serviceId] })],
);

export const bookings = sqliteTable(
  "bookings",
  {
    id: text("id").primaryKey(),
    idempotencyKey: text("idempotency_key").notNull(),
    requestFingerprint: text("request_fingerprint"),
    serviceId: text("service_id").notNull(),
    employeeId: text("employee_id").notNull(),
    dateLocal: text("date_local").notNull(),
    startTimeLocal: text("start_time_local").notNull(),
    endTimeLocal: text("end_time_local").notNull(),
    startsAt: text("starts_at").notNull(),
    endsAt: text("ends_at").notNull(),
    blockedUntil: text("blocked_until"),
    status: text("status", {
      enum: ["pending_calendar", "pending_confirmation", "confirmed", "cancelled", "needs_attention"],
    }).notNull(),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    email: text("email").notNull(),
    phone: text("phone").notNull(),
    note: text("note"),
    googleEventId: text("google_event_id"),
    googleEtag: text("google_etag"),
    googleConnectionId: text("google_connection_id"),
    operationToken: text("operation_token"),
    operationAction: text("operation_action", { enum: ["create", "confirm", "reschedule", "cancel", "delete"] }),
    operationStartedAt: text("operation_started_at"),
    calendarSequence: integer("calendar_sequence").notNull().default(0),
    deletedAt: text("deleted_at"),
    deletedByEmail: text("deleted_by_email"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("bookings_idempotency_key_unique").on(table.idempotencyKey),
    index("bookings_employee_time_idx").on(table.employeeId, table.startsAt, table.blockedUntil),
    index("bookings_status_idx").on(table.status),
    index("bookings_google_connection_idx").on(table.googleConnectionId, table.startsAt),
  ],
);

export const slotClaims = sqliteTable(
  "slot_claims",
  {
    employeeId: text("employee_id").notNull(),
    slotKey: text("slot_key").notNull(),
    bookingId: text("booking_id").notNull(),
    expiresAt: text("expires_at"),
  },
  (table) => [
    primaryKey({ columns: [table.employeeId, table.slotKey] }),
    index("slot_claims_booking_idx").on(table.bookingId),
  ],
);

export const scheduleExceptions = sqliteTable(
  "schedule_exceptions",
  {
    id: text("id").primaryKey(),
    employeeId: text("employee_id").notNull(),
    startsAt: text("starts_at").notNull(),
    endsAt: text("ends_at").notNull(),
    kind: text("kind", { enum: ["closed", "open", "break"] }).notNull(),
    note: text("note"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("schedule_exceptions_employee_idx").on(table.employeeId, table.startsAt, table.endsAt)],
);

export const notificationJobs = sqliteTable(
  "notification_jobs",
  {
    id: text("id").primaryKey(),
    bookingId: text("booking_id").notNull(),
    type: text("type", { enum: ["request_received", "confirmation", "reminder", "reschedule", "cancellation"] }).notNull(),
    dueAt: text("due_at").notNull(),
    status: text("status", { enum: ["pending", "sending", "scheduled", "sent", "failed", "cancelled"] }).notNull(),
    attempts: integer("attempts").notNull().default(0),
    providerId: text("provider_id"),
    providerAccountKey: text("provider_account_key"),
    providerGeneration: integer("provider_generation").notNull().default(0),
    deliveryKey: text("delivery_key"),
    payloadSnapshot: text("payload_snapshot"),
    lastError: text("last_error"),
    sentAt: text("sent_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("notification_job_unique").on(table.bookingId, table.type, table.dueAt),
    index("notification_jobs_due_idx").on(table.status, table.dueAt),
  ],
);

export const salonUsers = sqliteTable(
  "salon_users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    displayName: text("display_name").notNull(),
    role: text("role", { enum: ["owner", "admin", "staff"] }).notNull(),
    employeeId: text("employee_id"),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdByEmail: text("created_by_email").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    removedAt: text("removed_at"),
  },
  (table) => [
    uniqueIndex("salon_users_email_unique").on(table.email),
    uniqueIndex("salon_users_employee_unique").on(table.employeeId),
  ],
);

export const googleCalendarConnections = sqliteTable(
  "google_calendar_connections",
  {
    employeeId: text("employee_id").primaryKey(),
    connectionId: text("connection_id"),
    calendarId: text("calendar_id").notNull(),
    googleAccountEmail: text("google_account_email").notNull(),
    refreshTokenEncrypted: text("refresh_token_encrypted").notNull(),
    connectedByEmail: text("connected_by_email").notNull(),
    connectedAt: text("connected_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("google_calendar_connections_id_unique").on(table.connectionId),
    uniqueIndex("google_calendar_connections_account_unique").on(table.googleAccountEmail),
  ],
);

export const googleCalendarCleanupConnections = sqliteTable(
  "google_calendar_cleanup_connections",
  {
    id: text("id").primaryKey(),
    employeeId: text("employee_id").notNull(),
    calendarId: text("calendar_id").notNull(),
    googleAccountEmail: text("google_account_email").notNull(),
    refreshTokenEncrypted: text("refresh_token_encrypted").notNull(),
    connectedByEmail: text("connected_by_email").notNull(),
    connectedAt: text("connected_at").notNull(),
    sourceUpdatedAt: text("source_updated_at").notNull(),
    retiredAt: text("retired_at").notNull(),
    retiredByEmail: text("retired_by_email").notNull(),
    reason: text("reason", {
      enum: ["user_removed", "user_reassigned", "calendar_replaced"],
    }).notNull(),
    revocationToken: text("revocation_token"),
    revocationStartedAt: text("revocation_started_at"),
  },
  (table) => [
    uniqueIndex("google_calendar_cleanup_token_unique").on(table.refreshTokenEncrypted),
    index("google_calendar_cleanup_employee_idx").on(table.employeeId, table.retiredAt),
    index("google_calendar_cleanup_account_idx").on(table.googleAccountEmail),
  ],
);

export const calendarOauthStates = sqliteTable(
  "calendar_oauth_states",
  {
    stateHash: text("state_hash").primaryKey(),
    employeeId: text("employee_id").notNull(),
    userEmail: text("user_email").notNull(),
    codeVerifier: text("code_verifier").notNull(),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("calendar_oauth_states_expiry_idx").on(table.expiresAt)],
);

export const requestRateLimits = sqliteTable(
  "request_rate_limits",
  {
    key: text("key").primaryKey(),
    scope: text("scope").notNull(),
    windowStart: text("window_start").notNull(),
    expiresAt: text("expires_at").notNull(),
    attempts: integer("attempts").notNull().default(1),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [index("request_rate_limits_expiry_idx").on(table.expiresAt)],
);

export const adminAuditLog = sqliteTable(
  "admin_audit_log",
  {
    id: text("id").primaryKey(),
    actorEmail: text("actor_email").notNull(),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    details: text("details"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("admin_audit_log_created_idx").on(table.createdAt)],
);
