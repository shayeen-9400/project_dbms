# ============================================================
# Smart Student Manager - Flask Backend
# ============================================================
# This file contains all the server-side logic:
#   - Connects to MongoDB
#   - Serves HTML pages
#   - Provides REST API endpoints for CRUD operations
# ============================================================

from flask import Flask, render_template, request, jsonify, redirect, url_for
from pymongo import MongoClient
from pymongo.errors import ConnectionFailure, ServerSelectionTimeoutError
from bson.objectid import ObjectId

# ----- App & Database Setup -----
app = Flask(__name__)

# Connect to MongoDB (timeout set to 3 seconds so errors are fast)
# If using MongoDB Atlas, replace the URI below with your Atlas connection string
MONGO_URI = "mongodb://localhost:27017/"

client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=3000)
db = client["student_db"]          # Database name
students_col = db["students"]      # Collection name


def check_db():
    """Quick check if MongoDB is reachable."""
    try:
        client.admin.command("ping")
        return True
    except (ConnectionFailure, ServerSelectionTimeoutError):
        return False


# ============================================================
#  PAGE ROUTES — Serve HTML templates
# ============================================================

@app.route("/")
def index():
    """Serve the main dashboard page."""
    return render_template("index.html")


@app.route("/add")
def add_page():
    """Serve the 'Add Student' form page."""
    return render_template("add.html")


@app.route("/edit/<student_id>")
def edit_page(student_id):
    """Serve the 'Edit Student' form page with pre-filled data."""
    try:
        student = students_col.find_one({"_id": ObjectId(student_id)})
        if not student:
            return redirect(url_for("index"))
        # Convert ObjectId to string so the template can use it
        student["_id"] = str(student["_id"])
        return render_template("edit.html", student=student)
    except Exception as e:
        return redirect(url_for("index"))


# ============================================================
#  API ROUTES — JSON endpoints for CRUD
# ============================================================

@app.route("/api/students", methods=["GET"])
def get_students():
    """Return all students as a JSON array."""
    try:
        students = []
        for s in students_col.find():
            students.append({
                "_id": str(s["_id"]),
                "name": s["name"],
                "roll_number": s["roll_number"],
                "department": s["department"],
                "marks": s["marks"]
            })
        return jsonify(students)
    except (ConnectionFailure, ServerSelectionTimeoutError):
        return jsonify({"error": "Cannot connect to MongoDB. Make sure MongoDB is running on localhost:27017"}), 503
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/students", methods=["POST"])
def add_student():
    """Add a new student from JSON body."""
    try:
        data = request.get_json()
        new_student = {
            "name": data["name"],
            "roll_number": data["roll_number"],
            "department": data["department"],
            "marks": float(data["marks"])
        }
        result = students_col.insert_one(new_student)
        return jsonify({"message": "Student added successfully!", "id": str(result.inserted_id)}), 201
    except (ConnectionFailure, ServerSelectionTimeoutError):
        return jsonify({"error": "Cannot connect to MongoDB. Make sure MongoDB is running on localhost:27017"}), 503
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/students/<student_id>", methods=["PUT"])
def update_student(student_id):
    """Update an existing student by ID."""
    try:
        data = request.get_json()
        updated = {
            "name": data["name"],
            "roll_number": data["roll_number"],
            "department": data["department"],
            "marks": float(data["marks"])
        }
        students_col.update_one({"_id": ObjectId(student_id)}, {"$set": updated})
        return jsonify({"message": "Student updated successfully!"})
    except (ConnectionFailure, ServerSelectionTimeoutError):
        return jsonify({"error": "Cannot connect to MongoDB. Make sure MongoDB is running on localhost:27017"}), 503
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/students/<student_id>", methods=["DELETE"])
def delete_student(student_id):
    """Delete a student by ID."""
    try:
        students_col.delete_one({"_id": ObjectId(student_id)})
        return jsonify({"message": "Student deleted successfully!"})
    except (ConnectionFailure, ServerSelectionTimeoutError):
        return jsonify({"error": "Cannot connect to MongoDB. Make sure MongoDB is running on localhost:27017"}), 503
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/stats", methods=["GET"])
def get_stats():
    """Return dashboard statistics: total, average marks, highest marks."""
    try:
        all_students = list(students_col.find())
        total = len(all_students)

        if total == 0:
            return jsonify({"total": 0, "average": 0, "highest": 0})

        marks_list = [s["marks"] for s in all_students]
        average = round(sum(marks_list) / total, 1)
        highest = max(marks_list)

        return jsonify({"total": total, "average": average, "highest": highest})
    except (ConnectionFailure, ServerSelectionTimeoutError):
        return jsonify({"total": 0, "average": 0, "highest": 0})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ============================================================
#  Run the server
# ============================================================
if __name__ == "__main__":
    # Check MongoDB connection on startup
    if check_db():
        print("✅ MongoDB connected successfully!")
    else:
        print("⚠️  WARNING: Cannot connect to MongoDB at", MONGO_URI)
        print("   Make sure MongoDB is running. The app will start but CRUD operations will fail.")
        print("   To install MongoDB: https://www.mongodb.com/try/download/community")
    print("🚀 Server running at http://127.0.0.1:5000")
    app.run(debug=True)
