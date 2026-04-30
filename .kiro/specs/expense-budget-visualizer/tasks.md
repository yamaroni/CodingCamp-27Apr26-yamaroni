# Implementation Plan: Expense & Budget Visualizer

## Overview

Implement a single-page, client-side expense tracker using plain HTML, CSS, and Vanilla JavaScript. All application logic lives in `js/app.js`, all presentation in `css/styles.css`, and the entry point is `index.html`. Chart.js is loaded via CDN. Data is persisted in Local Storage under the key `ebv_transactions`.

## Tasks

- [x] 1. Create `index.html` — page structure and CDN wiring
  - Create `index.html` at the project root with a `<!DOCTYPE html>` document
  - Add `<link>` to `css/styles.css` in `<head>`
  - Add Chart.js CDN `<script>` tag before the closing `</body>` (e.g., `https://cdn.jsdelivr.net/npm/chart.js`)
  - Add `<script src="js/app.js" defer></script>` after the Chart.js tag
  - Add the Balance_Display element (e.g., `<div id="balance-display">`) prominently at the top
  - Add the Input_Form (`<form id="expense-form">`) with: text input `#item-name`, number input `#item-amount`, `<select id="item-category">` with options Food / Transport / Fun, a submit button, and inline error containers (`<span class="error">`) beneath each field
  - Add the Transaction_List container (`<ul id="transaction-list">`)
  - Add a `<canvas id="expense-chart">` element for the pie chart
  - Add a `<div id="storage-warning" hidden>` banner for the Local Storage error state
  - Add a `<p id="chart-fallback" hidden>` element for the Chart.js CDN fallback message
  - _Requirements: 1.1, 2.1, 3.1, 4.1, 4.5, 5.4, 6.1, 6.2, 7.1_

- [x] 2. Create `css/styles.css` — layout and visual design
  - Create `css/styles.css`
  - Style the Balance_Display to be visually prominent at the top (large font, clear contrast)
  - Style the Input_Form with readable label/input layout and visible inline error messages (e.g., red text)
  - Style the Transaction_List as a scrollable container with a fixed max-height; each list item shows name, amount, category, and a delete button
  - Style the pie chart canvas with a reasonable fixed size
  - Style the storage warning banner (non-blocking, yellow/amber background)
  - Ensure sufficient color contrast for all text elements
  - _Requirements: 6.4, 7.1, 7.2, 2.2_

- [x] 3. Create `js/app.js` — constants, data models, and StorageManager
  - Create `js/app.js`
  - Define `STORAGE_KEY = 'ebv_transactions'` and `CATEGORIES = ['Food', 'Transport', 'Fun']`
  - Define JSDoc typedefs for `Transaction`, `Category`, `CategoryTotals`, and `ValidationResult`
  - Implement `StorageManager.load()`: wraps `localStorage.getItem` + `JSON.parse` in a `try/catch`; returns `{ transactions: [], hadError: true }` on any error, otherwise `{ transactions: <parsed array>, hadError: false }`
  - Implement `StorageManager.save(transactions)`: serializes the array to JSON and writes it to `localStorage` under `STORAGE_KEY`
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 6.1_

- [x] 4. Implement `Validator` in `js/app.js`
  - Add `Validator.validate(name, amount, category)` to `js/app.js`
  - Rule — `name`: reject if empty or whitespace-only after `.trim()`
  - Rule — `amount`: reject if `parseFloat` is `NaN`, not finite, or `<= 0`
  - Rule — `category`: reject if not in `CATEGORIES`
  - Return `{ valid: boolean, errors: { name?, amount?, category? } }`
  - _Requirements: 1.3, 1.4, 6.1_

- [x] 5. Implement `StateManager` in `js/app.js`
  - Add `StateManager` object with `transactions: []` array and the following methods:
  - `init(transactions)`: sets `StateManager.transactions` to the provided array
  - `addTransaction(name, amount, category)`: generates a UUID via `crypto.randomUUID()` (with `Math.random()`-based fallback), creates a `Transaction` object with `id`, `name`, `amount` (as `parseFloat`), `category`, and `timestamp` (`Date.now()`), pushes it to `transactions`, calls `StorageManager.save()`, then calls `renderAll()`
  - `deleteTransaction(id)`: filters out the transaction with the matching `id`, calls `StorageManager.save()`, then calls `renderAll()`
  - `getTotal()`: returns the sum of all `amount` values (returns `0` for empty array)
  - `getCategoryTotals()`: returns `{ Food: 0, Transport: 0, Fun: 0 }` accumulated from `transactions`
  - _Requirements: 1.2, 2.5, 3.1, 3.2, 3.3, 3.4, 4.1, 5.1, 5.2, 6.1_

- [x] 6. Implement `ChartManager` in `js/app.js`
  - Add `ChartManager` object with `chart: null`
  - `init(canvasEl)`: checks `window.Chart`; if absent, shows the `#chart-fallback` element and returns; otherwise creates a `new Chart(canvasEl, { type: 'pie', ... })` with labels `['Food', 'Transport', 'Fun']` and stores the instance in `ChartManager.chart`
  - `update(totals)`: if `ChartManager.chart` is null, return; if all totals are zero, display the empty-state placeholder (e.g., update chart title or show a message element); otherwise update `chart.data.datasets[0].data` with `[totals.Food, totals.Transport, totals.Fun]` and call `chart.update()`
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 6.1_

- [x] 7. Implement UI renderer functions in `js/app.js`
  - `renderTransactionList(transactions)`: clears `#transaction-list`, then for each transaction appends a `<li>` containing the name, amount, category, and a delete `<button>` with a `data-id` attribute; attach a click listener on each delete button that calls `StateManager.deleteTransaction(id)`
  - `renderBalance(total)`: sets the text content of `#balance-display` to the formatted total (e.g., `"Total: $3.50"`)
  - `renderAll()`: calls `renderTransactionList(StateManager.transactions)`, `renderBalance(StateManager.getTotal())`, and `ChartManager.update(StateManager.getCategoryTotals())`
  - `showStorageWarning()`: removes the `hidden` attribute from `#storage-warning`
  - `showFormErrors(errors)`: for each key in `errors`, sets the text content of the corresponding `<span class="error">` element beneath that field
  - `clearFormErrors()`: clears all `<span class="error">` text content
  - `resetForm()`: calls `document.getElementById('expense-form').reset()`
  - _Requirements: 2.1, 2.3, 2.4, 3.1, 3.2, 3.3, 3.4, 4.2, 4.3, 5.4, 7.4_

- [x] 8. Wire up form submission and app initialization in `js/app.js`
  - Add a `submit` event listener on `#expense-form` that: calls `event.preventDefault()`, reads the three field values, calls `clearFormErrors()`, calls `Validator.validate()`, and on failure calls `showFormErrors(errors)`; on success calls `StateManager.addTransaction()` then `resetForm()`
  - Add a `DOMContentLoaded` event listener that: calls `StorageManager.load()`, calls `showStorageWarning()` if `hadError` is true, calls `StateManager.init(transactions)`, calls `ChartManager.init(document.getElementById('expense-chart'))`, and calls `renderAll()`
  - _Requirements: 1.2, 1.3, 1.4, 1.5, 2.3, 5.3, 5.4, 6.1_

- [ ] 9. Final checkpoint — verify full integration
  - Ensure all three files (`index.html`, `css/styles.css`, `js/app.js`) are present and correctly cross-referenced
  - Confirm the app initializes without console errors when Local Storage is empty
  - Confirm adding a transaction updates the list, balance, and chart
  - Confirm deleting a transaction updates the list, balance, and chart
  - Confirm validation errors appear inline and the list is not mutated
  - Confirm data survives a page reload (Local Storage persistence)
  - Ask the user if any questions arise before considering the feature complete

## Notes

- Tasks marked with `*` are optional and can be skipped (no test files are required per project constraints)
- Each task references specific requirements for traceability
- All logic is co-located in `js/app.js`; no additional JS files should be created
- Chart.js is the only external dependency and is loaded via CDN — no npm install or build step
- `crypto.randomUUID()` is available in all modern browsers; the `Math.random()` fallback covers edge cases
