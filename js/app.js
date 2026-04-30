// =============================================================================
// Expense & Budget Visualizer — app.js
// =============================================================================

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** @type {string} Local Storage key for persisting transactions */
const STORAGE_KEY = 'ebv_transactions';

/**
 * Valid expense categories.
 * @type {string[]}
 */
const CATEGORIES = ['Food', 'Transport', 'Fun'];

// ---------------------------------------------------------------------------
// JSDoc Type Definitions
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} Transaction
 * @property {string}   id        - UUID v4 generated at creation time (crypto.randomUUID())
 * @property {string}   name      - Item name (non-empty, trimmed)
 * @property {number}   amount    - Positive number (stored as float)
 * @property {Category} category  - One of 'Food' | 'Transport' | 'Fun'
 * @property {number}   timestamp - Unix ms timestamp (Date.now()) for ordering
 */

/**
 * @typedef {'Food' | 'Transport' | 'Fun'} Category
 */

/**
 * @typedef {Object} CategoryTotals
 * @property {number} Food
 * @property {number} Transport
 * @property {number} Fun
 */

/**
 * @typedef {Object} ValidationResult
 * @property {boolean} valid
 * @property {{ name?: string, amount?: string, category?: string }} errors
 */

// ---------------------------------------------------------------------------
// Validator
// ---------------------------------------------------------------------------

/**
 * Pure validation logic for the Input_Form fields.
 * No DOM side-effects — callers are responsible for rendering errors.
 */
const Validator = {
  /**
   * Validates the three Input_Form fields.
   *
   * Rules:
   *  - `name`     : must be non-empty after trimming whitespace.
   *  - `amount`   : must parse as a finite number and be strictly > 0.
   *  - `category` : must be one of the values in CATEGORIES.
   *
   * @param {string} name     - Raw value from the name text field.
   * @param {string} amount   - Raw value from the amount numeric field.
   * @param {string} category - Raw value from the category dropdown.
   * @returns {ValidationResult}
   */
  validate(name, amount, category) {
    const errors = {};

    // --- name ---
    if (!name || name.trim() === '') {
      errors.name = 'Name is required.';
    }

    // --- amount ---
    const parsed = parseFloat(amount);
    if (isNaN(parsed) || !isFinite(parsed) || parsed <= 0) {
      errors.amount = 'Amount must be a positive number.';
    }

    // --- category ---
    if (!CATEGORIES.includes(category)) {
      errors.category = 'Category must be one of: ' + CATEGORIES.join(', ') + '.';
    }

    return {
      valid: Object.keys(errors).length === 0,
      errors,
    };
  },
};

// ---------------------------------------------------------------------------
// StorageManager
// ---------------------------------------------------------------------------

/**
 * Manages reading and writing the transaction dataset to Local Storage.
 */
const StorageManager = {
  /**
   * Loads transactions from Local Storage.
   *
   * Wraps `localStorage.getItem` and `JSON.parse` in a try/catch so that any
   * error (storage unavailable, quota exceeded, malformed JSON, etc.) is
   * handled gracefully.
   *
   * @returns {{ transactions: Transaction[], hadError: boolean }}
   */
  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw === null) {
        // Key not present yet — treat as empty, no error
        return { transactions: [], hadError: false };
      }
      const parsed = JSON.parse(raw);
      // Guard against non-array values stored under the key
      if (!Array.isArray(parsed)) {
        return { transactions: [], hadError: true };
      }
      return { transactions: parsed, hadError: false };
    } catch (_err) {
      return { transactions: [], hadError: true };
    }
  },

  /**
   * Serializes the transactions array to JSON and writes it to Local Storage.
   *
   * @param {Transaction[]} transactions - The current transaction list to persist.
   * @returns {void}
   */
  save(transactions) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));
    } catch (_err) {
      // Storage may be unavailable (e.g., private browsing quota exceeded).
      // The app continues operating in-memory; the warning banner is shown on
      // load, so no additional action is needed here.
    }
  },
};

// ---------------------------------------------------------------------------
// StateManager
// ---------------------------------------------------------------------------

/**
 * Owns the canonical in-memory transaction array.
 * All mutations (add, delete) flow through here to keep state, storage, and
 * the UI in sync.
 */
const StateManager = {
  /** @type {Transaction[]} */
  transactions: [],

  /**
   * Initialises the in-memory state from a pre-loaded array (e.g. from
   * StorageManager.load()).
   *
   * @param {Transaction[]} transactions
   * @returns {void}
   */
  init(transactions) {
    StateManager.transactions = transactions;
  },

  /**
   * Creates a new Transaction, appends it to the in-memory list, persists the
   * updated list to storage, and triggers a full UI re-render.
   *
   * UUID generation uses `crypto.randomUUID()` when available, falling back to
   * a `Math.random()`-based generator for environments that lack the API.
   *
   * @param {string}   name     - Item name (non-empty, trimmed).
   * @param {number}   amount   - Positive expense amount.
   * @param {Category} category - One of 'Food' | 'Transport' | 'Fun'.
   * @returns {void}
   */
  addTransaction(name, amount, category) {
    // --- UUID generation ---
    let id;
    if (
      typeof crypto !== 'undefined' &&
      typeof crypto.randomUUID === 'function'
    ) {
      id = crypto.randomUUID();
    } else {
      // Math.random()-based UUID v4 fallback
      id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      });
    }

    /** @type {Transaction} */
    const transaction = {
      id,
      name,
      amount: parseFloat(amount),
      category,
      timestamp: Date.now(),
    };

    StateManager.transactions.push(transaction);
    StorageManager.save(StateManager.transactions);
    renderAll();
  },

  /**
   * Removes the transaction with the given id from the in-memory list,
   * persists the updated list to storage, and triggers a full UI re-render.
   *
   * @param {string} id - The UUID of the transaction to remove.
   * @returns {void}
   */
  deleteTransaction(id) {
    StateManager.transactions = StateManager.transactions.filter(
      (t) => t.id !== id
    );
    StorageManager.save(StateManager.transactions);
    renderAll();
  },

  /**
   * Returns the sum of all transaction amounts.
   * Returns 0 when the transaction list is empty.
   *
   * @returns {number}
   */
  getTotal() {
    return StateManager.transactions.reduce((sum, t) => sum + t.amount, 0);
  },

  /**
   * Returns an object with the total amount spent per category.
   * Categories not represented in the transaction list are returned as 0.
   *
   * @returns {CategoryTotals}
   */
  getCategoryTotals() {
    const totals = { Food: 0, Transport: 0, Fun: 0 };
    for (const t of StateManager.transactions) {
      if (Object.prototype.hasOwnProperty.call(totals, t.category)) {
        totals[t.category] += t.amount;
      }
    }
    return totals;
  },
};

// ---------------------------------------------------------------------------
// ChartManager
// ---------------------------------------------------------------------------

/**
 * Wraps the Chart.js instance. Owns creation and incremental updates.
 * All chart rendering and data updates flow through here.
 */
const ChartManager = {
  /** @type {Chart|null} */
  chart: null,

  /**
   * Creates the Chart.js pie chart on the given canvas element.
   *
   * If `window.Chart` is not available (e.g. CDN failed to load), the
   * `#chart-fallback` element is shown and the method returns early without
   * creating a chart instance.
   *
   * @param {HTMLCanvasElement} canvasEl - The canvas element to render into.
   * @returns {void}
   */
  init(canvasEl) {
    if (typeof window.Chart === 'undefined') {
      const fallback = document.getElementById('chart-fallback');
      if (fallback) {
        fallback.hidden = false;
      }
      return;
    }

    ChartManager.chart = new window.Chart(canvasEl, {
      type: 'pie',
      data: {
        labels: ['Food', 'Transport', 'Fun'],
        datasets: [
          {
            data: [0, 0, 0],
            backgroundColor: ['#FF6384', '#36A2EB', '#FFCE56'],
            hoverBackgroundColor: ['#FF6384', '#36A2EB', '#FFCE56'],
          },
        ],
      },
      options: {
        responsive: true,
        plugins: {
          title: {
            display: true,
            text: 'No expenses yet — add one to see the chart.',
          },
          legend: {
            position: 'bottom',
          },
        },
      },
    });
  },

  /**
   * Updates the chart with the latest category totals.
   *
   * - If `ChartManager.chart` is null (Chart.js unavailable), returns early.
   * - If all totals are zero, shows an empty-state title on the chart.
   * - Otherwise, updates the dataset and calls `chart.update()`.
   *
   * @param {CategoryTotals} totals - Current per-category expense totals.
   * @returns {void}
   */
  update(totals) {
    if (ChartManager.chart === null) {
      return;
    }

    const allZero = totals.Food === 0 && totals.Transport === 0 && totals.Fun === 0;

    if (allZero) {
      ChartManager.chart.data.datasets[0].data = [0, 0, 0];
      ChartManager.chart.options.plugins.title.text =
        'No expenses yet — add one to see the chart.';
      ChartManager.chart.options.plugins.title.display = true;
    } else {
      ChartManager.chart.data.datasets[0].data = [
        totals.Food,
        totals.Transport,
        totals.Fun,
      ];
      ChartManager.chart.options.plugins.title.display = false;
    }

    ChartManager.chart.update();
  },
};

// ---------------------------------------------------------------------------
// UI Renderer Functions
// ---------------------------------------------------------------------------

/**
 * Renders the transaction list into the `#transaction-list` element.
 *
 * Clears the existing list, then for each transaction appends a `<li>`
 * containing the item name, amount, category, and a delete button.
 * Each delete button carries a `data-id` attribute and a click listener
 * that calls `StateManager.deleteTransaction(id)`.
 *
 * @param {Transaction[]} transactions - The current list of transactions.
 * @returns {void}
 */
function renderTransactionList(transactions) {
  const list = document.getElementById('transaction-list');
  if (!list) return;

  // Clear existing items
  list.innerHTML = '';

  for (const transaction of transactions) {
    const li = document.createElement('li');

    // Transaction details
    const details = document.createElement('span');
    details.className = 'transaction-details';
    details.textContent = `${transaction.name} — $${transaction.amount.toFixed(2)} (${transaction.category})`;

    // Delete button
    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.textContent = 'Delete';
    deleteBtn.dataset.id = transaction.id;
    deleteBtn.addEventListener('click', () => {
      StateManager.deleteTransaction(transaction.id);
    });

    li.appendChild(details);
    li.appendChild(deleteBtn);
    list.appendChild(li);
  }
}

/**
 * Updates the `#balance-display` element with the formatted total.
 *
 * @param {number} total - The sum of all transaction amounts.
 * @returns {void}
 */
function renderBalance(total) {
  const display = document.getElementById('balance-display');
  if (!display) return;
  display.textContent = `Total: $${total.toFixed(2)}`;
}

/**
 * Performs a full UI re-render by updating the transaction list, balance
 * display, and pie chart from the current StateManager state.
 *
 * @returns {void}
 */
function renderAll() {
  renderTransactionList(StateManager.transactions);
  renderBalance(StateManager.getTotal());
  ChartManager.update(StateManager.getCategoryTotals());
}

/**
 * Shows the storage warning banner by removing its `hidden` attribute.
 *
 * @returns {void}
 */
function showStorageWarning() {
  const warning = document.getElementById('storage-warning');
  if (warning) {
    warning.removeAttribute('hidden');
  }
}

/**
 * Displays inline validation errors beneath the relevant form fields.
 *
 * Maps each error key (`name`, `amount`, `category`) to the corresponding
 * `<span class="error">` element using the IDs `#error-name`, `#error-amount`,
 * and `#error-category`.
 *
 * @param {{ name?: string, amount?: string, category?: string }} errors
 * @returns {void}
 */
function showFormErrors(errors) {
  const fieldMap = {
    name: 'error-name',
    amount: 'error-amount',
    category: 'error-category',
  };

  for (const [key, message] of Object.entries(errors)) {
    const spanId = fieldMap[key];
    if (spanId) {
      const span = document.getElementById(spanId);
      if (span) {
        span.textContent = message;
      }
    }
  }
}

/**
 * Clears all inline validation error messages from the form.
 *
 * @returns {void}
 */
function clearFormErrors() {
  const errorSpans = document.querySelectorAll('#expense-form .error');
  for (const span of errorSpans) {
    span.textContent = '';
  }
}

/**
 * Resets the expense form to its default empty state.
 *
 * @returns {void}
 */
function resetForm() {
  document.getElementById('expense-form').reset();
}

// ---------------------------------------------------------------------------
// Form Submission Handler
// ---------------------------------------------------------------------------

/**
 * Handles the `#expense-form` submit event.
 *
 * 1. Prevents the default browser form submission.
 * 2. Reads the three field values from the DOM.
 * 3. Clears any existing inline validation errors.
 * 4. Runs the Validator; on failure, renders inline errors and stops.
 * 5. On success, adds the transaction via StateManager and resets the form.
 */
document.getElementById('expense-form').addEventListener('submit', (event) => {
  event.preventDefault();

  const name     = document.getElementById('item-name').value;
  const amount   = document.getElementById('item-amount').value;
  const category = document.getElementById('item-category').value;

  clearFormErrors();

  const result = Validator.validate(name, amount, category);

  if (!result.valid) {
    showFormErrors(result.errors);
    return;
  }

  StateManager.addTransaction(name, amount, category);
  resetForm();
});

// ---------------------------------------------------------------------------
// App Initialization
// ---------------------------------------------------------------------------

/**
 * Bootstraps the application once the DOM is fully parsed.
 *
 * 1. Loads persisted transactions from Local Storage.
 * 2. Shows the storage warning banner if the load encountered an error.
 * 3. Initialises StateManager with the loaded (or empty) transaction array.
 * 4. Initialises ChartManager with the canvas element.
 * 5. Performs an initial full render so the UI reflects persisted state.
 */
document.addEventListener('DOMContentLoaded', () => {
  const { transactions, hadError } = StorageManager.load();

  if (hadError) {
    showStorageWarning();
  }

  StateManager.init(transactions);
  ChartManager.init(document.getElementById('expense-chart'));
  renderAll();
});
