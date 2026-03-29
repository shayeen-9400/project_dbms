# ============================================================
# Smart Student Manager - Flask Backend (v2 — Full Features)
# ============================================================
# Features:
#   - MongoDB CRUD with unique roll_number index
#   - Input validation with helpful error messages
#   - Sort / Filter / Paginate students
#   - CSV export endpoint
#   - Grade distribution data for Chart.js
#   - Single student fetch + detail page
# ============================================================

from flask import Flask, render_template, request, jsonify, redirect, url_for, Response
from pymongo import MongoClient, ASCENDING, DESCENDING
from pymongo.errors import ConnectionFailure, ServerSelectionTimeoutError, DuplicateKeyError
from bson.objectid import ObjectId
import csv
import io

# ----- App & Database Setup -----
app = Flask(__name__)

MONGO_URI = "mongodb://localhost:27017/"
client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=3000)
db = client["student_db"]
students_col = db["students"]

# Predefined departments
DEPARTMENTS = [
    "Computer Science (CS)",
    "Information Technology (IT)",
    "Electronics & Communication (ECE)",
    "Electrical Engineering (EE)",
    "Mechanical Engineering (ME)",
    "Civil Engineering (CE)",
    "Business Administration (MBA)",
    "Mathematics (MATH)",
    "Physics (PHY)",
    "Other",
]


def check_db():
    """Quick check if MongoDB is reachable."""
    try:
        client.admin.command("ping")
        return True
    except (ConnectionFailure, ServerSelectionTimeoutError):
        return False


def ensure_indexes():
    """Create a unique index on roll_number to prevent duplicates."""
    try:
        students_col.create_index([("roll_number", ASCENDING)], unique=True)
    except Exception:
        pass


def validate_student(data):
    """
    Validate student payload. Returns (cleaned_data, error_string).
    error_string is None if valid.
    """
    name = (data.get("name") or "").strip()
    roll_number = (data.get("roll_number") or "").strip()
    department = (data.get("department") or "").strip()
    marks_raw = data.get("marks")

    if not name:
        return None, "Name is required."
    if len(name) < 2:
        return None, "Name must be at least 2 characters."
    if not roll_number:
        return None, "Roll number is required."
    if not department:
        return None, "Department is required."
    if marks_raw is None or marks_raw == "":
        return None, "Marks are required."

    try:
        marks = float(marks_raw)
    except (ValueError, TypeError):
        return None, "Marks must be a valid number."

    if marks < 0 or marks > 100:
        return None, "Marks must be between 0 and 100."

    return {
        "name": name,
        "roll_number": roll_number,
        "department": department,
        "marks": round(marks, 1),
    }, None


def get_grade(marks):
    """Compute letter grade from numeric marks."""
    if marks >= 90:
        return "A+"
    elif marks >= 80:
        return "A"
    elif marks >= 70:
        return "B"
    elif marks >= 60:
        return "C"
    elif marks >= 50:
        return "D"
    else:
        return "F"


def serialize_student(s):
    """Convert a MongoDB document to a JSON-serializable dict."""
    marks = s.get("marks", 0)
    return {
        "_id":        str(s["_id"]),
        "name":       s.get("name", ""),
        "roll_number": s.get("roll_number", ""),
        "department": s.get("department", ""),
        "marks":      marks,
        "grade":      get_grade(marks),
    }


# ============================================================
#  PAGE ROUTES
# ============================================================

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/add")
def add_page():
    return render_template("add.html", departments=DEPARTMENTS)


@app.route("/edit/<student_id>")
def edit_page(student_id):
    try:
        student = students_col.find_one({"_id": ObjectId(student_id)})
        if not student:
            return redirect(url_for("index"))
        student["_id"] = str(student["_id"])
        return render_template("edit.html", student=student, departments=DEPARTMENTS)
    except Exception:
        return redirect(url_for("index"))


@app.route("/view/<student_id>")
def view_page(student_id):
    try:
        student = students_col.find_one({"_id": ObjectId(student_id)})
        if not student:
            return redirect(url_for("index"))
        student["_id"] = str(student["_id"])
        student["grade"] = get_grade(student.get("marks", 0))
        return render_template("view.html", student=student)
    except Exception:
        return redirect(url_for("index"))


# ============================================================
#  API ROUTES
# ============================================================

@app.route("/api/departments", methods=["GET"])
def get_departments():
    """Return the list of predefined departments."""
    return jsonify(DEPARTMENTS)


@app.route("/api/students", methods=["GET"])
def get_students():
    """
    Return students with optional filtering, sorting, and pagination.
    Query params:
      department: filter by department name (or 'all')
      sort: 'name_asc' | 'name_desc' | 'marks_asc' | 'marks_desc'
      page: page number (default 1)
      per_page: items per page (default 9, max 100)
      search: search query (name or roll_number)
    """
    try:
        query = {}

        # Department filter
        dept = request.args.get("department", "all")
        if dept and dept != "all":
            query["department"] = dept

        # Search filter
        search = request.args.get("search", "").strip()
        if search:
            query["$or"] = [
                {"name":        {"$regex": search, "$options": "i"}},
                {"roll_number": {"$regex": search, "$options": "i"}},
            ]

        # Sorting
        sort_map = {
            "name_asc":    [("name", ASCENDING)],
            "name_desc":   [("name", DESCENDING)],
            "marks_asc":   [("marks", ASCENDING)],
            "marks_desc":  [("marks", DESCENDING)],
        }
        sort_key = request.args.get("sort", "name_asc")
        sort_order = sort_map.get(sort_key, sort_map["name_asc"])

        # Pagination
        page = max(1, int(request.args.get("page", 1)))
        per_page = min(100, max(1, int(request.args.get("per_page", 9))))
        skip = (page - 1) * per_page

        total = students_col.count_documents(query)
        cursor = students_col.find(query).sort(sort_order).skip(skip).limit(per_page)
        students = [serialize_student(s) for s in cursor]

        return jsonify({
            "students": students,
            "total":    total,
            "page":     page,
            "per_page": per_page,
            "pages":    max(1, -(-total // per_page)),  # ceiling division
        })
    except (ConnectionFailure, ServerSelectionTimeoutError):
        return jsonify({"error": "Cannot connect to MongoDB."}), 503
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/students/export", methods=["GET"])
def export_students():
    """Export all students as a CSV file."""
    try:
        dept = request.args.get("department", "all")
        query = {}
        if dept and dept != "all":
            query["department"] = dept

        students = list(students_col.find(query).sort("name", ASCENDING))

        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["Name", "Roll Number", "Department", "Marks", "Grade"])
        for s in students:
            marks = s.get("marks", 0)
            writer.writerow([
                s.get("name", ""),
                s.get("roll_number", ""),
                s.get("department", ""),
                marks,
                get_grade(marks),
            ])

        output.seek(0)
        return Response(
            output.getvalue(),
            mimetype="text/csv",
            headers={"Content-Disposition": "attachment; filename=students.csv"},
        )
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/students/<student_id>", methods=["GET"])
def get_student(student_id):
    """Return a single student by ID."""
    try:
        student = students_col.find_one({"_id": ObjectId(student_id)})
        if not student:
            return jsonify({"error": "Student not found"}), 404
        return jsonify(serialize_student(student))
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/students", methods=["POST"])
def add_student():
    """Add a new student with validation."""
    try:
        data = request.get_json() or {}
        cleaned, error = validate_student(data)
        if error:
            return jsonify({"error": error}), 400

        result = students_col.insert_one(cleaned)
        return jsonify({"message": "Student added successfully!", "id": str(result.inserted_id)}), 201

    except DuplicateKeyError:
        return jsonify({"error": f"Roll number '{data.get('roll_number', '')}' already exists."}), 409
    except (ConnectionFailure, ServerSelectionTimeoutError):
        return jsonify({"error": "Cannot connect to MongoDB."}), 503
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/students/<student_id>", methods=["PUT"])
def update_student(student_id):
    """Update a student with validation."""
    try:
        data = request.get_json() or {}
        cleaned, error = validate_student(data)
        if error:
            return jsonify({"error": error}), 400

        result = students_col.update_one(
            {"_id": ObjectId(student_id)},
            {"$set": cleaned}
        )
        if result.matched_count == 0:
            return jsonify({"error": "Student not found"}), 404
        return jsonify({"message": "Student updated successfully!"})

    except DuplicateKeyError:
        return jsonify({"error": f"Roll number '{data.get('roll_number', '')}' already exists."}), 409
    except (ConnectionFailure, ServerSelectionTimeoutError):
        return jsonify({"error": "Cannot connect to MongoDB."}), 503
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/students/<student_id>", methods=["DELETE"])
def delete_student(student_id):
    """Delete a student by ID."""
    try:
        students_col.delete_one({"_id": ObjectId(student_id)})
        return jsonify({"message": "Student deleted successfully!"})
    except (ConnectionFailure, ServerSelectionTimeoutError):
        return jsonify({"error": "Cannot connect to MongoDB."}), 503
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/stats", methods=["GET"])
def get_stats():
    """Return dashboard statistics + grade distribution for chart."""
    try:
        all_students = list(students_col.find())
        total = len(all_students)

        if total == 0:
            return jsonify({
                "total": 0, "average": 0, "highest": 0,
                "grade_dist": {"A+": 0, "A": 0, "B": 0, "C": 0, "D": 0, "F": 0},
            })

        marks_list = [s.get("marks", 0) for s in all_students]
        average = round(sum(marks_list) / total, 1)
        highest = max(marks_list)

        # Grade distribution
        grade_dist = {"A+": 0, "A": 0, "B": 0, "C": 0, "D": 0, "F": 0}
        for m in marks_list:
            grade_dist[get_grade(m)] += 1

        # Department breakdown
        dept_counts = {}
        for s in all_students:
            dept = s.get("department", "Other")
            dept_counts[dept] = dept_counts.get(dept, 0) + 1

        return jsonify({
            "total":      total,
            "average":    average,
            "highest":    highest,
            "grade_dist": grade_dist,
            "dept_counts": dept_counts,
        })
    except (ConnectionFailure, ServerSelectionTimeoutError):
        return jsonify({"total": 0, "average": 0, "highest": 0, "grade_dist": {}})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ============================================================
#  Run the server
# ============================================================
if __name__ == "__main__":
    ensure_indexes()
    if check_db():
        print("✅ MongoDB connected successfully!")
        print("   Unique index on roll_number enforced.")
    else:
        print("⚠️  WARNING: Cannot connect to MongoDB at", MONGO_URI)
        print("   Make sure MongoDB is running. The app will start but CRUD operations will fail.")
    print("🚀 Server running at http://127.0.0.1:5000")
    app.run(debug=True)
