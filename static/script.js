// ============================================================
// Smart Student Manager — Client-Side JavaScript (v2)
// ============================================================
// Features: Sort, Filter, Pagination, Search, Grades, Chart,
//           CSV Export, Toast notifications, CRUD (AJAX)
// ============================================================

// ----- State -----
let deleteTargetId = null;
let currentPage   = 1;
let totalPages    = 1;
let currentSort   = "name_asc";
let currentDept   = "all";
let currentSearch = "";

// DOM refs (safe — may not exist on every page)
const cardsContainer   = document.getElementById("cards-container");
const emptyState       = document.getElementById("empty-state");
const searchInput      = document.getElementById("search-input");
const toastContainer   = document.getElementById("toast-container");
const deleteModal      = document.getElementById("delete-modal");
const confirmDeleteBtn = document.getElementById("confirm-delete-btn");
const cancelDeleteBtn  = document.getElementById("cancel-delete-btn");
const addForm          = document.getElementById("add-form");
const editForm         = document.getElementById("edit-form");
const sortSelect       = document.getElementById("sort-select");
const paginationEl     = document.getElementById("pagination");
const pageInfo         = document.getElementById("page-info");
const exportBtn        = document.getElementById("export-btn");

// ============================================================
//  TOAST NOTIFICATIONS
// ============================================================

function showToast(message) {
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.innerHTML = `<i class="fas fa-check-circle"></i> ${message}`;
    toastContainer.appendChild(toast);
    setTimeout(() => {
        toast.classList.add("toast-out");
        toast.addEventListener("animationend", () => toast.remove());
    }, 3000);
}

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
//  GRADE HELPERS
// ============================================================

function getGrade(marks) {
    if (marks >= 90) return "A+";
    if (marks >= 80) return "A";
    if (marks >= 70) return "B";
    if (marks >= 60) return "C";
    if (marks >= 50) return "D";
    return "F";
}

function gradeClass(grade) {
    const map = { "A+": "grade-ap", "A": "grade-a", "B": "grade-b", "C": "grade-c", "D": "grade-d", "F": "grade-f" };
    return map[grade] || "grade-f";
}

// ============================================================
//  FETCH & RENDER
// ============================================================

async function fetchStudents(page = 1) {
    if (!cardsContainer) return;
    try {
        const params = new URLSearchParams({
            sort:       currentSort,
            department: currentDept,
            search:     currentSearch,
            page:       page,
            per_page:   9,
        });
        const res  = await fetch(`/api/students?${params}`);
        const data = await res.json();

        if (data.error) {
            showErrorToast(data.error);
            renderCards([]);
            return;
        }

        currentPage = data.page;
        totalPages  = data.pages;
        renderCards(data.students);
        renderPagination(data.total);
    } catch (err) {
        console.error("Error fetching students:", err);
        showErrorToast("Cannot connect to server");
    }
}

async function fetchStats() {
    try {
        const res  = await fetch("/api/stats");
        const data = await res.json();
        animateNumber("total-students", data.total);
        animateNumber("average-marks",  data.average);
        animateNumber("highest-marks",  data.highest);

        if (data.grade_dist)  renderGradeChart(data.grade_dist);
        if (data.dept_counts) renderDeptChart(data.dept_counts);
    } catch (err) {
        console.error("Error fetching stats:", err);
    }
}

async function fetchDeptTabs() {
    if (!document.getElementById("dept-tabs-inner")) return;
    try {
        const res   = await fetch("/api/departments");
        const depts = await res.json();

        // Count per dept for the active filter
        const countRes  = await fetch("/api/students?per_page=100");
        const countData = await countRes.json();
        const students  = countData.students || [];
        const deptCount = {};
        students.forEach(s => { deptCount[s.department] = (deptCount[s.department] || 0) + 1; });

        buildDeptTabs(depts, deptCount);
    } catch (err) {
        console.error("Error fetching departments:", err);
    }
}

function buildDeptTabs(depts, counts) {
    const inner = document.getElementById("dept-tabs-inner");
    if (!inner) return;
    inner.innerHTML = "";

    // "All" tab
    const allTab = makeTab("All Students", "all", currentDept === "all");
    inner.appendChild(allTab);

    depts.forEach(dept => {
        const count = counts[dept];
        if (!count) return; // only show depts that have students
        inner.appendChild(makeTab(`${dept.split(" ")[0]} (${count})`, dept, currentDept === dept));
    });
}

function makeTab(label, value, isActive) {
    const btn = document.createElement("button");
    btn.className  = isActive ? "dept-tab active" : "dept-tab";
    btn.textContent = label;
    btn.dataset.dept = value;
    btn.addEventListener("click", () => {
        currentDept = value;
        currentPage = 1;
        document.querySelectorAll(".dept-tab").forEach(t => t.classList.remove("active"));
        btn.classList.add("active");
        fetchStudents(1);
    });
    return btn;
}

// ============================================================
//  RENDER CARDS
// ============================================================

function renderCards(students) {
    if (!cardsContainer) return;
    cardsContainer.innerHTML = "";

    if (students.length === 0) {
        emptyState.style.display = "block";
        if (paginationEl) paginationEl.style.display = "none";
        return;
    }
    emptyState.style.display = "none";
    if (paginationEl) paginationEl.style.display = "flex";

    students.forEach((s, index) => {
        const initials = s.name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
        const grade    = s.grade || getGrade(s.marks);
        const gClass   = gradeClass(grade);

        const card = document.createElement("div");
        card.className = "student-card";
        card.style.animationDelay = `${index * 0.06}s`;
        card.innerHTML = `
            <div class="card-header">
                <div class="card-avatar">${initials}</div>
                <h3 title="${escapeHtml(s.name)}">${escapeHtml(s.name)}</h3>
            </div>
            <div class="card-detail">
                <i class="fas fa-id-badge"></i>
                <span>${escapeHtml(s.roll_number)}</span>
            </div>
            <div class="card-detail">
                <i class="fas fa-building"></i>
                <span>${escapeHtml(s.department)}</span>
            </div>
            <div class="card-marks-row">
                <div class="card-marks"><i class="fas fa-star"></i> ${s.marks}</div>
                <span class="grade-badge ${gClass}">${grade}</span>
            </div>
            <div class="card-actions">
                <a href="/view/${s._id}" class="btn btn-info btn-sm">
                    <i class="fas fa-eye"></i> View
                </a>
                <a href="/edit/${s._id}" class="btn btn-secondary btn-sm">
                    <i class="fas fa-pen"></i> Edit
                </a>
                <button class="btn btn-danger btn-sm" onclick="openDeleteModal('${s._id}')">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `;
        cardsContainer.appendChild(card);
    });
}

function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = String(text);
    return div.innerHTML;
}

// ============================================================
//  PAGINATION
// ============================================================

function renderPagination(total) {
    if (!paginationEl) return;
    paginationEl.innerHTML = "";

    if (totalPages <= 1) {
        paginationEl.style.display = "none";
        return;
    }
    paginationEl.style.display = "flex";

    const showing = Math.min(9, total - (currentPage - 1) * 9);
    if (pageInfo) pageInfo.textContent = `Page ${currentPage} of ${totalPages} (${total} students)`;

    // Prev button
    const prev = document.createElement("button");
    prev.className = "page-btn";
    prev.innerHTML = `<i class="fas fa-chevron-left"></i>`;
    prev.disabled  = currentPage === 1;
    prev.addEventListener("click", () => { fetchStudents(currentPage - 1); window.scrollTo(0, 0); });
    paginationEl.appendChild(prev);

    // Page numbers
    const pageNumbers = getPageNumbers(currentPage, totalPages);
    pageNumbers.forEach(p => {
        if (p === "...") {
            const dots = document.createElement("span");
            dots.className = "page-info";
            dots.textContent = "…";
            paginationEl.appendChild(dots);
            return;
        }
        const btn = document.createElement("button");
        btn.className = p === currentPage ? "page-btn active" : "page-btn";
        btn.textContent = p;
        btn.addEventListener("click", () => { fetchStudents(p); window.scrollTo(0, 0); });
        paginationEl.appendChild(btn);
    });

    // Next button
    const next = document.createElement("button");
    next.className = "page-btn";
    next.innerHTML = `<i class="fas fa-chevron-right"></i>`;
    next.disabled  = currentPage === totalPages;
    next.addEventListener("click", () => { fetchStudents(currentPage + 1); window.scrollTo(0, 0); });
    paginationEl.appendChild(next);
}

function getPageNumbers(current, total) {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    const pages = [1];
    if (current > 3) pages.push("...");
    for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) pages.push(i);
    if (current < total - 2) pages.push("...");
    pages.push(total);
    return pages;
}

// ============================================================
//  CHART.JS
// ============================================================

let gradeChartInstance = null;
let deptChartInstance  = null;

function renderGradeChart(gradeDist) {
    const canvas = document.getElementById("grade-chart");
    if (!canvas) return;
    if (gradeChartInstance) gradeChartInstance.destroy();

    const labels = ["A+", "A", "B", "C", "D", "F"];
    const values = labels.map(l => gradeDist[l] || 0);
    const colors = ["#00e676", "#69f0ae", "#00e5ff", "#ffd740", "#ff9800", "#ff4d6a"];

    gradeChartInstance = new Chart(canvas, {
        type: "bar",
        data: {
            labels,
            datasets: [{
                data:            values,
                backgroundColor: colors.map(c => c + "33"),
                borderColor:     colors,
                borderWidth:     2,
                borderRadius:    8,
                borderSkipped:   false,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { grid: { color: "rgba(255,255,255,0.05)" }, ticks: { color: "#a0a0c0", font: { family: "Poppins" } } },
                y: { grid: { color: "rgba(255,255,255,0.05)" }, ticks: { color: "#a0a0c0", stepSize: 1, font: { family: "Poppins" } }, beginAtZero: true },
            },
        }
    });
}

function renderDeptChart(deptCounts) {
    const canvas = document.getElementById("dept-chart");
    if (!canvas) return;
    if (deptChartInstance) deptChartInstance.destroy();

    const labels = Object.keys(deptCounts).map(d => d.split("(")[0].trim());
    const values = Object.values(deptCounts);
    const palette = ["#00e5ff","#7c4dff","#00e676","#ffd740","#ff4d6a","#ff9800","#f06292","#80cbc4","#aed581","#ffb74d"];

    deptChartInstance = new Chart(canvas, {
        type: "doughnut",
        data: {
            labels,
            datasets: [{
                data: values,
                backgroundColor: palette.map(c => c + "bb"),
                borderColor:     palette,
                borderWidth:     2,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: "right",
                    labels: { color: "#a0a0c0", font: { family: "Poppins", size: 11 }, boxWidth: 14, padding: 10 }
                }
            },
            cutout: "65%",
        }
    });
}

// ============================================================
//  NUMBER ANIMATION
// ============================================================

function animateNumber(elementId, target) {
    const el = document.getElementById(elementId);
    if (!el) return;
    const duration = 700;
    const start    = parseFloat(el.textContent) || 0;
    const diff     = target - start;
    if (diff === 0) { el.textContent = target; return; }
    const startTime = performance.now();
    function step(now) {
        const elapsed  = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const ease     = 1 - Math.pow(1 - progress, 3);
        el.textContent = Math.round(start + diff * ease);
        if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
}

// ============================================================
//  LIVE SEARCH
// ============================================================

let searchTimer = null;
if (searchInput) {
    searchInput.addEventListener("input", () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
            currentSearch = searchInput.value.trim();
            currentPage   = 1;
            fetchStudents(1);
        }, 300);
    });
}

// ============================================================
//  SORT
// ============================================================

if (sortSelect) {
    sortSelect.addEventListener("change", () => {
        currentSort = sortSelect.value;
        currentPage = 1;
        fetchStudents(1);
    });
}

// ============================================================
//  EXPORT CSV
// ============================================================

if (exportBtn) {
    exportBtn.addEventListener("click", () => {
        const params = new URLSearchParams({ department: currentDept });
        window.location.href = `/api/students/export?${params}`;
    });
}

// ============================================================
//  DELETE STUDENT
// ============================================================

function openDeleteModal(id) {
    deleteTargetId = id;
    deleteModal.style.display = "flex";
}
function closeDeleteModal() {
    deleteTargetId = null;
    deleteModal.style.display = "none";
}

if (cancelDeleteBtn) cancelDeleteBtn.addEventListener("click", closeDeleteModal);

if (confirmDeleteBtn) {
    confirmDeleteBtn.addEventListener("click", async () => {
        if (!deleteTargetId) return;
        try {
            const res  = await fetch(`/api/students/${deleteTargetId}`, { method: "DELETE" });
            const data = await res.json();
            if (res.ok) {
                showToast(data.message);
            } else {
                showErrorToast(data.error || "Failed to delete");
            }
            closeDeleteModal();
            fetchStudents(currentPage);
            fetchStats();
            fetchDeptTabs();
        } catch (err) {
            console.error("Error deleting student:", err);
            showErrorToast("Cannot connect to server");
        }
    });
}

// ============================================================
//  ADD STUDENT FORM
// ============================================================

if (addForm) {
    addForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const submitBtn = addForm.querySelector("[type=submit]");
        submitBtn.disabled = true;
        submitBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Adding…`;

        const payload = {
            name:        document.getElementById("name").value.trim(),
            roll_number: document.getElementById("roll_number").value.trim(),
            department:  document.getElementById("department").value,
            marks:       document.getElementById("marks").value,
        };

        try {
            const res  = await fetch("/api/students", {
                method:  "POST",
                headers: { "Content-Type": "application/json" },
                body:    JSON.stringify(payload),
            });
            const data = await res.json();
            if (!res.ok || data.error) {
                showErrorToast(data.error || "Failed to add student");
                submitBtn.disabled = false;
                submitBtn.innerHTML = `<i class="fas fa-plus"></i> Add Student`;
                return;
            }
            sessionStorage.setItem("toast", data.message);
            window.location.href = "/";
        } catch (err) {
            console.error("Error adding student:", err);
            showErrorToast("Cannot connect to server");
            submitBtn.disabled = false;
            submitBtn.innerHTML = `<i class="fas fa-plus"></i> Add Student`;
        }
    });
}

// ============================================================
//  EDIT STUDENT FORM
// ============================================================

if (editForm) {
    editForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const submitBtn = editForm.querySelector("[type=submit]");
        submitBtn.disabled = true;
        submitBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Saving…`;

        const studentId = editForm.getAttribute("data-id");
        const payload = {
            name:        document.getElementById("name").value.trim(),
            roll_number: document.getElementById("roll_number").value.trim(),
            department:  document.getElementById("department").value,
            marks:       document.getElementById("marks").value,
        };

        try {
            const res  = await fetch(`/api/students/${studentId}`, {
                method:  "PUT",
                headers: { "Content-Type": "application/json" },
                body:    JSON.stringify(payload),
            });
            const data = await res.json();
            if (!res.ok || data.error) {
                showErrorToast(data.error || "Failed to update student");
                submitBtn.disabled = false;
                submitBtn.innerHTML = `<i class="fas fa-save"></i> Update Student`;
                return;
            }
            sessionStorage.setItem("toast", data.message);
            window.location.href = "/";
        } catch (err) {
            console.error("Error updating student:", err);
            showErrorToast("Cannot connect to server");
            submitBtn.disabled = false;
            submitBtn.innerHTML = `<i class="fas fa-save"></i> Update Student`;
        }
    });
}

// ============================================================
//  ON PAGE LOAD — Dashboard
// ============================================================

if (cardsContainer) {
    fetchStudents(1);
    fetchStats();
    fetchDeptTabs();

    const pendingToast = sessionStorage.getItem("toast");
    if (pendingToast) {
        setTimeout(() => showToast(pendingToast), 300);
        sessionStorage.removeItem("toast");
    }
}
