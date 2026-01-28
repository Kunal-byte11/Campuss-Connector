const API_BASE = '';
let students = [];
let selectedFile = null;

document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    initUpload();
    initForms();
    loadStudents();
});

function initNavigation() {
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const section = link.dataset.section;
            showSection(section);
        });
    });
}

function showSection(sectionId) {
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    document.getElementById(sectionId)?.classList.add('active');
    document.querySelector(`[data-section="${sectionId}"]`)?.classList.add('active');

    if (sectionId === 'upload') populateStudentDropdown();
    if (sectionId === 'students') loadStudents();
}

async function loadStudents() {
    try {
        const res = await fetch(`${API_BASE}/api/students`);
        students = await res.json();
        renderStudents();
        updateStats();
    } catch (err) {
        console.error('Failed to load students:', err);
    }
}

function renderStudents() {
    const grid = document.getElementById('students-grid');
    if (students.length === 0) {
        grid.innerHTML = '<div class="empty-state">No students found. Add your first student!</div>';
        return;
    }

    grid.innerHTML = students.map(s => `
        <div class="student-card" onclick="viewStudent('${s.studentId}')">
            <div class="student-header">
                <div class="student-avatar">${s.name?.charAt(0) || s.studentId.charAt(0)}</div>
                <div>
                    <div class="student-name">${s.name || 'Unnamed'}</div>
                    <div class="student-id">${s.studentId}</div>
                </div>
            </div>
            <div class="student-meta">
                <span class="meta-tag">${s.department || 'No Dept'}</span>
                <span class="meta-tag">📄 ${countDocs(s)} docs</span>
            </div>
        </div>
    `).join('');
}

function countDocs(student) {
    if (!student.documents) return 0;
    return Object.values(student.documents).reduce((sum, arr) => sum + arr.length, 0);
}

function updateStats() {
    document.getElementById('total-students').textContent = students.length;
    const totalDocs = students.reduce((sum, s) => sum + countDocs(s), 0);
    document.getElementById('total-documents').textContent = totalDocs;
    const depts = new Set(students.map(s => s.department).filter(Boolean));
    document.getElementById('total-departments').textContent = depts.size;
}

function initUpload() {
    const dropzone = document.getElementById('dropzone');
    const fileInput = document.getElementById('file-input');

    dropzone.addEventListener('click', () => fileInput.click());
    dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('dragover'); });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
    dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('dragover');
        if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
    });

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length) handleFile(e.target.files[0]);
    });
}

function handleFile(file) {
    selectedFile = file;
    document.getElementById('file-name').textContent = file.name;
    document.getElementById('selected-file').style.display = 'flex';
    document.getElementById('dropzone').style.display = 'none';
    updateUploadBtn();
}

function removeFile() {
    selectedFile = null;
    document.getElementById('file-input').value = '';
    document.getElementById('selected-file').style.display = 'none';
    document.getElementById('dropzone').style.display = 'block';
    updateUploadBtn();
}

function updateUploadBtn() {
    const studentId = document.getElementById('upload-student').value;
    document.getElementById('upload-btn').disabled = !(selectedFile && studentId);
}

function populateStudentDropdown() {
    const select = document.getElementById('upload-student');
    select.innerHTML = '<option value="">Select student...</option>' +
        students.map(s => `<option value="${s.studentId}">${s.studentId} - ${s.name || 'Unnamed'}</option>`).join('');
    select.addEventListener('change', updateUploadBtn);
}

function initForms() {
    document.getElementById('upload-form').addEventListener('submit', handleUpload);
    document.getElementById('add-student-form').addEventListener('submit', handleAddStudent);
    document.getElementById('search-input').addEventListener('input', handleSearch);
}

async function handleUpload(e) {
    e.preventDefault();
    if (!selectedFile) return;

    const studentId = document.getElementById('upload-student').value;
    const btn = document.getElementById('upload-btn');
    btn.disabled = true;
    btn.textContent = 'Uploading...';

    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('studentId', studentId);

    try {
        const res = await fetch(`${API_BASE}/upload`, { method: 'POST', body: formData });
        const data = await res.json();

        document.getElementById('ai-response').style.display = 'block';
        document.getElementById('ai-message').textContent = data.aiResponse || 'Upload complete';

        showToast(data.success ? 'Document uploaded successfully!' : 'Upload failed', data.success ? 'success' : 'error');
        if (data.success) { removeFile(); loadStudents(); }
    } catch (err) {
        showToast('Upload failed: ' + err.message, 'error');
    }

    btn.disabled = false;
    btn.textContent = 'Upload';
}

async function handleAddStudent(e) {
    e.preventDefault();

    const data = {
        studentId: document.getElementById('new-student-id').value,
        name: document.getElementById('new-student-name').value,
        department: document.getElementById('new-student-dept').value,
        email: document.getElementById('new-student-email').value
    };

    try {
        const res = await fetch(`${API_BASE}/api/students`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        if (res.ok) {
            showToast('Student added successfully!', 'success');
            closeModal('add-student-modal');
            e.target.reset();
            loadStudents();
        } else {
            const err = await res.json();
            showToast(err.error || 'Failed to add student', 'error');
        }
    } catch (err) {
        showToast('Failed to add student', 'error');
    }
}

async function viewStudent(studentId) {
    const student = students.find(s => s.studentId === studentId);
    if (!student) return;

    document.getElementById('view-student-title').textContent = student.name || student.studentId;

    const docs = student.documents || {};
    const docTypes = [
        { key: 'assignmentLinks', label: '📝 Assignments' },
        { key: 'idCardLinks', label: '🪪 ID Cards' },
        { key: 'certificateLinks', label: '🏆 Certificates' },
        { key: 'feeReceiptLinks', label: '🧾 Fee Receipts' }
    ];

    let html = `
        <p><strong>ID:</strong> ${student.studentId}</p>
        <p><strong>Department:</strong> ${student.department || 'N/A'}</p>
        <p><strong>Email:</strong> ${student.email || 'N/A'}</p>
    `;

    docTypes.forEach(({ key, label }) => {
        const items = docs[key] || [];
        html += `<div class="documents-section"><h4>${label} (${items.length})</h4>`;
        if (items.length) {
            html += '<div class="doc-list">' + items.map(d =>
                `<div class="doc-item"><a href="${d.shareableLink}" target="_blank">${d.fileName}</a></div>`
            ).join('') + '</div>';
        } else {
            html += '<p class="empty-state">No documents</p>';
        }
        html += '</div>';
    });

    document.getElementById('view-student-body').innerHTML = html;
    openModal('view-student-modal');
}

function handleSearch(e) {
    const query = e.target.value.toLowerCase();
    const filtered = students.filter(s =>
        s.studentId.toLowerCase().includes(query) ||
        (s.name && s.name.toLowerCase().includes(query)) ||
        (s.department && s.department.toLowerCase().includes(query))
    );
    renderFilteredStudents(filtered);
}

function renderFilteredStudents(list) {
    const grid = document.getElementById('students-grid');
    if (list.length === 0) {
        grid.innerHTML = '<div class="empty-state">No matching students found</div>';
        return;
    }
    grid.innerHTML = list.map(s => `
        <div class="student-card" onclick="viewStudent('${s.studentId}')">
            <div class="student-header">
                <div class="student-avatar">${s.name?.charAt(0) || s.studentId.charAt(0)}</div>
                <div>
                    <div class="student-name">${s.name || 'Unnamed'}</div>
                    <div class="student-id">${s.studentId}</div>
                </div>
            </div>
            <div class="student-meta">
                <span class="meta-tag">${s.department || 'No Dept'}</span>
                <span class="meta-tag">📄 ${countDocs(s)} docs</span>
            </div>
        </div>
    `).join('');
}

function openModal(id) { document.getElementById(id).classList.add('active'); }
function closeModal(id) { document.getElementById(id).classList.remove('active'); }

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}
