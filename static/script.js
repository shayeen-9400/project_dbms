// ============================================================
// Smart Student Manager — Client-Side JavaScript
// ============================================================
// Handles: Fetching data, rendering cards, live search,
//          form submissions (AJAX), toasts, delete confirmation
// ============================================================

// ----- Global state -----
let allStudents = [];       // Stores all students for live search
let deleteTargetId = null;  // ID of student pending deletion

// ----- DOM references (safe — may not exist on every page) -----
const cardsContainer   = document.getElementById("cards-container");
const emptyState       = document.getElementById("empty-state");
const searchInput      = document.getElementById("search-input");
const toastContainer   = document.getElementById("toast-container");
const deleteModal      = document.getElementById("delete-modal");
const confirmDeleteBtn = document.getElementById("confirm-delete-btn");
const cancelDeleteBtn  = document.getElementById("cancel-delete-btn");
const addForm          = document.getElementById("add-form");
const editForm         = document.getElementById("edit-form");

// ============================================================
//  TOAST NOTIFICATIONS
// ============================================================

/**
 * Show a brief success toast at the top-right corner.
 * @param {string} message - The message to display
 */
function showToast(message) {
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.innerHTML = `<i class="fas fa-check-circle"></i> ${message}`;
    toastContainer.appendChild(toast);

    // Auto-remove after 3 seconds
    setTimeout(() => {
        toast.classList.add("toast-out");
        toast.addEventListener("animationend", () => toast.remove());
    }, 3000);
}

/**
 * Show a red error toast when something goes wrong.
 * @param {string} message - The error message
 */
function showErrorToast(message) {
    const toast = document.createElement("div");
    toast.className = "toast toast-error";
    toast.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${message}`;
    toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.classList.add("toast-out");
        toast.addEventListener("animationend", () => toast.remove());
    }, 5000);
}

// ============================================================
//  FETCH DATA
// ============================================================

/** Fetch all students from the API and render cards. */
async function fetchStudents() {
    try {
        const res = await fetch("/api/students");
        const data = await res.json();
        if (data.error) {
            showErrorToast(data.error);
            allStudents = [];
        } else {
            allStudents = Array.isArray(data) ? data : [];
        }
        renderCards(allStudents);
    } catch (err) {
        console.error("Error fetching students:", err);
        showErrorToast("Cannot connect to server");
    }
}

/** Fetch dashboard stats and update the stat cards. */
async function fetchStats() {
    try {
        const res = await fetch("/api/stats");
        const data = await res.json();
        animateNumber("total-students", data.total);
        animateNumber("average-marks", data.average);
        animateNumber("highest-marks", data.highest);
    } catch (err) {
        console.error("Error fetching stats:", err);
    }
}

/**
 * Simple number count-up animation for stat cards.
 * @param {string} elementId - ID of the <h3> element
 * @param {number} target    - Target number to animate to
 */
function animateNumber(elementId, target) {
    const el = document.getElementById(elementId);
    if (!el) return;
    const duration = 600;  // ms
    const start = parseInt(el.textContent) || 0;
    const diff = target - start;
    if (diff === 0) { el.textContent = target; return; }
    const startTime = performance.now();

    function step(now) {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        // Ease-out curve
        const ease = 1 - Math.pow(1 - progress, 3);
        el.textContent = Math.round(start + diff * ease);
        if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
}

// ============================================================
//  RENDER STUDENT CARDS
// ============================================================

/**
 * Render an array of student objects as card DOM elements.
 * @param {Array} students - Array of student objects
 */
function renderCards(students) {
    if (!cardsContainer) return;

    cardsContainer.innerHTML = "";

    // Show/hide empty state
    if (students.length === 0) {
        emptyState.style.display = "block";
        return;
    }
    emptyState.style.display = "none";

    students.forEach((s, index) => {
        const initials = s.name
            .split(" ")
            .map(w => w[0])
            .join("")
            .toUpperCase()
            .slice(0, 2);

        const card = document.createElement("div");
        card.className = "student-card";
        card.style.animationDelay = `${index * 0.06}s`;

        card.innerHTML = `
            <div class="card-header">
                <div class="card-avatar">${initials}</div>
                <h3>${escapeHtml(s.name)}</h3>
            </div>
            <div class="card-detail">
                <i class="fas fa-id-badge"></i>
                <span>${escapeHtml(s.roll_number)}</span>
            </div>
            <div class="card-detail">
                <i class="fas fa-building"></i>
                <span>${escapeHtml(s.department)}</span>
            </div>
            <div class="card-marks">
                <i class="fas fa-star"></i> ${s.marks} Marks
            </div>
            <div class="card-actions">
                <a href="/edit/${s._id}" class="btn btn-secondary btn-sm">
                    <i class="fas fa-pen"></i> Edit
                </a>
                <button class="btn btn-danger btn-sm" onclick="openDeleteModal('${s._id}')">
                    <i class="fas fa-trash"></i> Delete
                </button>
            </div>
        `;
        cardsContainer.appendChild(card);
    });
}

/** Escape HTML to prevent XSS. */
function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}

// ============================================================
//  LIVE SEARCH
// ============================================================

if (searchInput) {
    searchInput.addEventListener("input", () => {
        const query = searchInput.value.toLowerCase().trim();
        if (!query) {
            renderCards(allStudents);
            return;
        }
        const filtered = allStudents.filter(s =>
            s.name.toLowerCase().includes(query) ||
            s.roll_number.toLowerCase().includes(query)
        );
        renderCards(filtered);
    });
}

// ============================================================
//  DELETE STUDENT
// ============================================================

/** Open the delete confirmation modal. */
function openDeleteModal(id) {
    deleteTargetId = id;
    deleteModal.style.display = "flex";
}

/** Close the delete confirmation modal. */
function closeDeleteModal() {
    deleteTargetId = null;
    deleteModal.style.display = "none";
}

if (cancelDeleteBtn) {
    cancelDeleteBtn.addEventListener("click", closeDeleteModal);
}

if (confirmDeleteBtn) {
    confirmDeleteBtn.addEventListener("click", async () => {
        if (!deleteTargetId) return;
        try {
            const res = await fetch(`/api/students/${deleteTargetId}`, { method: "DELETE" });
            const data = await res.json();
            showToast(data.message);
            closeDeleteModal();
            // Refresh data
            fetchStudents();
            fetchStats();
        } catch (err) {
            console.error("Error deleting student:", err);
        }
    });
}

// ============================================================
//  ADD STUDENT FORM
// ============================================================

if (addForm) {
    addForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        const payload = {
            name: document.getElementById("name").value.trim(),
            roll_number: document.getElementById("roll_number").value.trim(),
            department: document.getElementById("department").value.trim(),
            marks: document.getElementById("marks").value
        };

        try {
            const res = await fetch("/api/students", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (!res.ok || data.error) {
                showErrorToast(data.error || "Failed to add student");
                return;
            }
            // Store toast message for the dashboard to show
            sessionStorage.setItem("toast", data.message);
            window.location.href = "/";
        } catch (err) {
            console.error("Error adding student:", err);
            showErrorToast("Cannot connect to server");
        }
    });
}

// ============================================================
//  EDIT STUDENT FORM
// ============================================================

if (editForm) {
    editForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        const studentId = editForm.getAttribute("data-id");
        const payload = {
            name: document.getElementById("name").value.trim(),
            roll_number: document.getElementById("roll_number").value.trim(),
            department: document.getElementById("department").value.trim(),
            marks: document.getElementById("marks").value
        };

        try {
            const res = await fetch(`/api/students/${studentId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (!res.ok || data.error) {
                showErrorToast(data.error || "Failed to update student");
                return;
            }
            sessionStorage.setItem("toast", data.message);
            window.location.href = "/";
        } catch (err) {
            console.error("Error updating student:", err);
            showErrorToast("Cannot connect to server");
        }
    });
}

// ============================================================
//  ON PAGE LOAD — Dashboard
// ============================================================

// Only run on the index/dashboard page
if (cardsContainer) {
    fetchStudents();
    fetchStats();

    // Show any pending toast from add/edit redirect
    const pendingToast = sessionStorage.getItem("toast");
    if (pendingToast) {
        // Small delay so the page renders first
        setTimeout(() => showToast(pendingToast), 300);
        sessionStorage.removeItem("toast");
    }
}
