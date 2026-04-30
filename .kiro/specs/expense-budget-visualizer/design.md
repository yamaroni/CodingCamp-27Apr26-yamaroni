# Design Document: Expense & Budget Visualizer

## Overview

The Expense & Budget Visualizer is a single-page, client-side web application built with plain HTML, CSS, and Vanilla JavaScript. It lets users record expense transactions, view a running total balance, browse a scrollable transaction history, and see a live pie chart of spending by category. All data is persisted in the browser's Local Storage so records survive page reloads and browser restarts. The app ships as a self-contained set of static files and can be opened directly in a browser or packaged as a browser extension.

**Key design goals:**
- Zero dependencies beyond Chart.js (loaded via CDN) — no build step, no bundler, no framework.
- A single JS file (`js/app.js`) owns all application logic; a single CSS file (`css/styles.css`) owns all presentation.
- All state mutations flow through a central `StateManager` so the UI is always consistent with Storage.
- The pie chart is rendered and updated exclusively through Chart.js; no custom canvas drawing code.

---

## Architecture

The application follows a simple **event-driven MVC-lite** pattern entirely within one JS file.

```
┌─────────────────────────────────────────────────────────┐
│                        index.html                        │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │  Input_Form  │  │ Balance_Disp │  │     Chart     │  │
│  └──────┬───────┘  └──────▲───────┘  └──────▲────────┘  │
│         │  DOM events     │  render()        │ render()  │
│  ┌──────▼──────────────────────────────────────────────┐ │
│  │                   app.js                            │ │
│  │  ┌─────────────┐  ┌──────────────┐  ┌───────────┐  │ │
│  │  │  Validator  │  │ StateManager │  │ChartManager│ │ │
│  │  └─────────────┘  └──────┬───────┘  └───────────┘  │ │
│  │                          │ read/write               │ │
│  │                   ┌──────▼───────┐                  │ │
│  │                   │StorageManager│                  │ │
│  │                   └──────────────┘                  │ │
│  └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

**Data flow for adding a transaction:**
1. User fills Input_Form and submits.
2. `Validator` checks fields; on failure, renders inline errors and stops.
3. On success, `StateManager.addTransaction()` is called.
4. `StateManager` appends the transaction to the in-memory array, calls `StorageManager.save()`, then calls `renderAll()`.
5. `renderAll()` updates the Transaction_List DOM, Balance_Display, and calls `ChartManager.update()`.

**Data flow on page load:**
1. `StorageManager.load()` reads and parses Local Storage.
2. On parse error or unavailability, an empty array is used and a warning banner is shown.
3. `StateManager` is initialized with the loaded array.
4. `renderAll()` populates the UI.

---

## Components and Interfaces

### StorageManager

Responsible for reading and writing the transaction dataset to Local Storage.

```js
const STORAGE_KEY = 'ebv_transactions';

StorageManager = {
  // Returns Transaction[] or [] on error; sets a flag if an error occurred
  load(): { transactions: Transaction[], hadError: boolean },

  // Serializes transactions array to JSON and writes to localStorage
  save(transactions: Transaction[]): void,
}
```

### StateManager

Owns the canonical in-memory transaction array. All mutations go through here.

```js
StateManager = {
  transactions: Transaction[],   // in-memory state

  init(transactions: Transaction[]): void,

  // Creates a new Transaction, appends it, persists, re-renders
  addTransaction(name: string, amount: number, category: Category): void,

  // Removes transaction by id, persists, re-renders
  deleteTransaction(id: string): void,

  // Returns sum of all transaction amounts
  getTotal(): number,

  // Returns { Food: number, Transport: number, Fun: number }
  getCategoryTotals(): CategoryTotals,
}
```

### Validator

Pure validation logic — no DOM side effects except writing error messages.

```js
Validator = {
  // Returns { valid: boolean, errors: { name?: string, amount?: string, category?: string } }
  validate(name: string, amount: string, category: string): ValidationResult,
}
```

Validation rules:
- `name`: must be non-empty after trimming.
- `amount`: must parse as a finite number and be strictly greater than 0.
- `category`: must be one of `['Food', 'Transport', 'Fun']`.

### ChartManager

Wraps the Chart.js instance. Owns creation and incremental updates.

```js
ChartManager = {
  chart: Chart | null,

  // Creates the Chart.js pie chart on the given canvas element
  init(canvasEl: HTMLCanvasElement): void,

  // Updates chart data from CategoryTotals; shows placeholder if all zeros
  update(totals: CategoryTotals): void,
}
```

### UI Renderer (inline functions in app.js)

```js
function renderTransactionList(transactions: Transaction[]): void
function renderBalance(total: number): void
function renderAll(): void
function showStorageWarning(): void
function showFormErrors(errors: ValidationResult['errors']): void
function clearFormErrors(): void
function resetForm(): void
```

---

## Data Models

### Transaction

```js
/**
 * @typedef {Object} Transaction
 * @property {string}   id        - UUID v4 generated at creation time (crypto.randomUUID())
 * @property {string}   name      - Item name (non-empty, trimmed)
 * @property {number}   amount    - Positive number (stored as float)
 * @property {Category} category  - One of 'Food' | 'Transport' | 'Fun'
 * @property {number}   timestamp - Unix ms timestamp (Date.now()) for ordering
 */
```

### Category

```js
/**
 * @typedef {'Food' | 'Transport' | 'Fun'} Category
 */
const CATEGORIES = ['Food', 'Transport', 'Fun'];
```

### CategoryTotals

```js
/**
 * @typedef {Object} CategoryTotals
 * @property {number} Food
 * @property {number} Transport
 * @property {number} Fun
 */
```

### ValidationResult

```js
/**
 * @typedef {Object} ValidationResult
 * @property {boolean} valid
 * @property {{ name?: string, amount?: string, category?: string }} errors
 */
```

### Storage Schema

Transactions are stored as a JSON array under the key `ebv_transactions`:

```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Coffee",
    "amount": 3.50,
    "category": "Food",
    "timestamp": 1700000000000
  }
]
```

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Valid transaction addition grows the list

*For any* transaction list and any valid transaction (non-empty name, positive amount, valid category), adding that transaction SHALL result in the transaction list length increasing by exactly one.

**Validates: Requirements 1.2**

---

### Property 2: Invalid inputs are rejected without mutation

*For any* combination of inputs where at least one field is empty, non-positive, or non-numeric, the Validator SHALL reject the submission and the transaction list SHALL remain unchanged.

**Validates: Requirements 1.3, 1.4**

---

### Property 3: Delete removes exactly the targeted transaction

*For any* transaction list containing at least one transaction, deleting a transaction by its id SHALL result in a list that no longer contains that id and whose length is exactly one less than before.

**Validates: Requirements 2.5**

---

### Property 4: Balance equals sum of all transaction amounts

*For any* transaction list, the value returned by `getTotal()` SHALL equal the arithmetic sum of the `amount` fields of all transactions in the list.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4**

---

### Property 5: Category totals partition the full total

*For any* transaction list, the sum of all values in `getCategoryTotals()` SHALL equal `getTotal()`, and each category total SHALL equal the sum of amounts of transactions belonging to that category.

**Validates: Requirements 4.1, 4.2, 4.3**

---

### Property 6: Storage round-trip preserves transaction data

*For any* array of transactions, serializing it via `StorageManager.save()` and then deserializing it via `StorageManager.load()` SHALL produce an array that is deeply equal to the original (same ids, names, amounts, categories, and timestamps).

**Validates: Requirements 5.1, 5.2, 5.3**

---

### Property 7: Form reset clears all fields after successful submission

*For any* valid form submission, after the transaction is added the Input_Form SHALL have an empty name field, an empty amount field, and the category selector reset to its default state.

**Validates: Requirements 1.5**

---

## Error Handling

| Scenario | Handling |
|---|---|
| Empty or whitespace name | Inline error below name field; form not submitted |
| Non-positive or non-numeric amount | Inline error below amount field; form not submitted |
| Invalid category (not in enum) | Inline error below category field; form not submitted |
| `localStorage` unavailable (e.g., private browsing quota exceeded) | `StorageManager.load()` returns `{ transactions: [], hadError: true }`; app shows a non-blocking yellow warning banner at the top of the page; app continues with empty state |
| `localStorage` contains malformed JSON | Same as above — caught by `try/catch` around `JSON.parse()` |
| Chart.js CDN fails to load | `ChartManager.init()` checks for `window.Chart`; if absent, the chart canvas area shows a static fallback message: "Chart unavailable — could not load Chart.js." |
| `crypto.randomUUID()` unavailable | Fallback to a simple `Math.random()`-based UUID generator |

---

## Testing Strategy

Because this feature involves pure data-transformation functions (validation, state mutation, storage serialization, balance/category calculations), property-based testing is appropriate for the core logic layer. UI rendering and Chart.js integration are better covered by example-based and smoke tests.

### Property-Based Testing

Use **fast-check** (JavaScript PBT library) to verify the correctness properties defined above.

- Each property test runs a minimum of **100 iterations**.
- Each test is tagged with a comment in the format:
  `// Feature: expense-budget-visualizer, Property N: <property text>`

**Targeted modules / functions:**
- `Validator.validate()` — Property 2
- `StateManager.addTransaction()` — Property 1
- `StateManager.deleteTransaction()` — Property 3
- `StateManager.getTotal()` — Property 4
- `StateManager.getCategoryTotals()` — Property 5
- `StorageManager.save()` / `StorageManager.load()` — Property 6
- Form reset logic — Property 7

### Unit / Example-Based Tests

- Validator rejects each invalid field type in isolation (empty name, zero amount, negative amount, unknown category).
- `getTotal()` returns `0` when the transaction list is empty.
- `getCategoryTotals()` returns `{ Food: 0, Transport: 0, Fun: 0 }` when the list is empty.
- `StorageManager.load()` returns `hadError: true` when `localStorage` contains malformed JSON.
- `ChartManager.update()` with all-zero totals triggers the empty-state placeholder.

### Smoke / Integration Tests

- App initializes without errors when `localStorage` is empty.
- App initializes without errors when `localStorage` contains a valid dataset.
- App shows the storage warning banner when `localStorage` is pre-seeded with malformed JSON.
- Chart.js canvas element is present in the DOM after initialization.

### What is NOT property-tested

- Visual layout and typography (not computable properties).
- Chart.js rendering output (external library, tested by its authors).
- CDN availability (infrastructure concern, not application logic).
- Response-time requirements (performance, not unit-testable in isolation).
- Scrollability of the Transaction_List (CSS/layout, not logic).
