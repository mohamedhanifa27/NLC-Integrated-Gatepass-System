import os
import socket
import threading
import subprocess
import re
import time
from datetime import datetime
from flask import Flask, request, jsonify, send_from_directory, send_file
from flask_cors import CORS
from werkzeug.security import check_password_hash, generate_password_hash
from flask_jwt_extended import JWTManager, create_access_token, jwt_required, get_jwt_identity, get_jwt
from dotenv import load_dotenv
from database import init_engine, get_db, User, GatePass, GateActivity, VisitorPass, MaterialPass
from sqlalchemy.orm import Session
from sqlalchemy import func, text, and_

load_dotenv()

app = Flask(__name__)
CORS(app)

from flask import g
import database

def get_flask_db():
    if 'db' not in g:
        g.db = database.SessionLocal()
    return g.db

@app.teardown_appcontext
def teardown_db(exception):
    db = g.pop('db', None)
    if db is not None:
        db.close()


app.config['JWT_SECRET_KEY'] = os.getenv('JWT_SECRET_KEY', 'fallback-secret-key-for-dev')
app.config['JWT_ACCESS_TOKEN_EXPIRES'] = 8 * 3600  # 8 hours
jwt = JWTManager(app)

# Initialize DB
init_engine()

def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"

def start_ngrok():
    try:
        process = subprocess.Popen([
            'ngrok.exe', 'http',
            '--url=plop-voicing-affidavit.ngrok-free.dev',
            '5000'
        ], stdout=subprocess.PIPE, stderr=subprocess.PIPE, universal_newlines=True)
        
        print("[IGPS] Public access:  https://plop-voicing-affidavit.ngrok-free.dev  <-- PERMANENT, NEVER CHANGES")
        print("[IGPS] Server is live.")
    except FileNotFoundError:
        print("[!] ngrok not found in the current directory or PATH.")
        print("[!] Please install ngrok to enable the public tunnel.")

BASE_DIR = os.path.abspath(os.path.dirname(__file__))

# --- Static File Routing ---
@app.route('/')
def serve_index():
    return send_file(os.path.join(BASE_DIR, 'login.html'))

@app.route('/<path:path>')
def serve_static(path):
    full_path = os.path.join(BASE_DIR, path)
    if os.path.exists(full_path):
        return send_file(full_path)
    return "File not found", 404

# --- API Routes ---

@app.route('/api/auth/login', methods=['POST'])
def login():
    data = request.get_json()
    email_or_id = data.get('employee_id', '').strip()
    password = data.get('password', '')
    role = data.get('role', 'employee')
    
    db = get_flask_db()
    user = db.query(User).filter_by(email=email_or_id).first()
    
    if not user or not check_password_hash(user.password, password):
        return jsonify({"message": "Invalid email or password."}), 401
        
    if hasattr(user, 'is_active') and user.is_active == False:
        return jsonify({"message": "Account deactivated. Contact administrator."}), 403

    if user.role != role:
        return jsonify({"message": f"This account is registered as '{user.role}'. Please select the correct role."}), 403
    
    additional_claims = {
        "name": user.name,
        "role": user.role,
        "department": user.department
    }
    token = create_access_token(identity=str(user.user_id), additional_claims=additional_claims)
    
    return jsonify({
        "token": token,
        "user": {
            "id": user.user_id,
            "name": user.name,
            "department": user.department,
            "role": user.role
        }
    }), 200

@app.route('/api/profile', methods=['GET'])
@jwt_required()
def get_profile():
    user_id_str = get_jwt_identity()
    user_id = int(user_id_str) if str(user_id_str).isdigit() else user_id_str
    db = get_flask_db()
    user = db.query(User).filter_by(user_id=user_id).first()
    if not user:
        return jsonify({'message': 'User not found'}), 404
        
    return jsonify({
        'user_id': user.user_id,
        'name': user.name,
        'email': user.email,
        'role': user.role,
        'department': user.department
    }), 200

@app.route('/api/profile', methods=['PUT'])
@jwt_required()
def update_profile():
    user_id_str = get_jwt_identity()
    user_id = int(user_id_str) if str(user_id_str).isdigit() else user_id_str
    db = get_flask_db()
    user = db.query(User).filter_by(user_id=user_id).first()
    if not user:
        return jsonify({'message': 'User not found'}), 404
        
    data = request.get_json()
    if not data:
        return jsonify({'message': 'No data provided'}), 400
        
    if 'name' in data:
        user.name = data['name']
    if 'department' in data:
        user.department = data['department']
        
    if 'password' in data and data['password']:
        current_password = data.get('current_password')
        print(f"DEBUG: Changing password for {user.email}")
        print(f"DEBUG: current_password received: '{current_password}'")
        if not current_password or not check_password_hash(user.password, current_password):
            print(f"DEBUG: Hash check failed. DB hash: {user.password}")
            return jsonify({'message': 'Invalid current password'}), 400
        user.password = generate_password_hash(data['password'])
        
    try:
        db.commit()
        
        additional_claims = {
            "name": user.name,
            "role": user.role,
            "department": user.department
        }
        token = create_access_token(identity=str(user.user_id), additional_claims=additional_claims)
        
        return jsonify({
            'user_id': user.user_id,
            'name': user.name,
            'email': user.email,
            'role': user.role,
            'department': user.department,
            'token': token
        }), 200
    except Exception as e:
        db.rollback()
        return jsonify({'message': 'Failed to update profile', 'error': str(e)}), 500

@app.route('/api/dashboard/stats', methods=['GET'])
@jwt_required()
def get_dashboard_stats():
    user_id_str = get_jwt_identity()
    user_id = int(user_id_str) if str(user_id_str).isdigit() else user_id_str
    db = get_flask_db()
    
    user = db.query(User).filter_by(user_id=user_id).first()
    if not user:
        return jsonify({"message": "User not found"}), 404

    # Date calculations (offset-naive)
    today = datetime.now()
    this_month_start = today.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    
    if today.month == 1:
        last_month_start = today.replace(year=today.year-1, month=12, day=1, hour=0, minute=0, second=0, microsecond=0)
    else:
        last_month_start = today.replace(month=today.month-1, day=1, hour=0, minute=0, second=0, microsecond=0)

    # Fetch all user passes
    gp_records = db.query(GatePass).all()
    vp_records = db.query(VisitorPass).all()
    mp_records = db.query(MaterialPass).all()
    
    all_records = gp_records + vp_records + mp_records
    
    if user.role == 'employee':
        all_records = [p for p in all_records if getattr(p, 'user_id', getattr(p, 'host_user_id', getattr(p, 'requested_by', None))) == user_id]
        gp_records = [p for p in gp_records if p.user_id == user_id]
        vp_records = [p for p in vp_records if p.host_user_id == user_id]
        mp_records = [p for p in mp_records if p.requested_by == user_id]

    total = len(all_records)
    
    approved = sum(1 for p in all_records if p.status == 'approved')
    pending = sum(1 for p in all_records if p.status == 'pending')
    rejected = sum(1 for p in all_records if p.status == 'rejected')
    
    this_month_total = 0
    for p in gp_records:
        if p.request_date and p.request_date >= this_month_start.date():
            this_month_total += 1
    for p in vp_records + mp_records:
        if p.request_date and p.request_date >= this_month_start:
            this_month_total += 1
            
    last_month_rejected = 0
    for p in all_records:
        if p.status == 'rejected' and p.approved_at and last_month_start <= p.approved_at < this_month_start:
            last_month_rejected += 1
            
    approval_rate = 0.0
    if total > 0:
        approval_rate = round((approved / total) * 100, 1)

    return jsonify({
        "total": total,
        "approved": approved,
        "pending": pending,
        "rejected": rejected,
        "this_month_total": this_month_total,
        "last_month_rejected": last_month_rejected,
        "approval_rate": approval_rate
    }), 200

@app.route('/api/dashboard/metrics', methods=['GET'])
@jwt_required()
def get_metrics():
    user_id_str = get_jwt_identity()
    user_id = int(user_id_str) if str(user_id_str).isdigit() else user_id_str
    db = get_flask_db()
    
    user = db.query(User).filter_by(user_id=user_id).first()
    if not user:
        return jsonify({"message": "User not found"}), 404

    today = datetime.now().date()
    # If admin or security, they might see all metrics. If employee, only theirs.
    query = db.query(
        func.sum(func.if_(and_(GatePass.status == 'approved', func.date(GatePass.approved_at) == today), 1, 0)).label('approved'),
        func.sum(func.if_(GatePass.status == 'pending', 1, 0)).label('pending'),
        func.sum(func.if_(and_(GatePass.status == 'rejected', func.date(GatePass.approved_at) == today), 1, 0)).label('rejected'),
        func.count(GatePass.pass_id).label('total')
    )
    
    if user.role == 'employee':
        query = query.filter(GatePass.user_id == user_id)
        
    metrics = query.one()
    
    return jsonify({
        "total": int(metrics.total or 0),
        "approved": int(metrics.approved or 0),
        "pending": int(metrics.pending or 0),
        "rejected": int(metrics.rejected or 0)
    }), 200

@app.route('/api/passes', methods=['GET'])
@jwt_required()
def get_passes():
    user_id_str = get_jwt_identity()
    user_id = int(user_id_str) if str(user_id_str).isdigit() else user_id_str
    limit = request.args.get('limit', 10, type=int)
    db = get_flask_db()
    
    user = db.query(User).filter_by(user_id=user_id).first()
    if not user:
        return jsonify({"message": "User not found"}), 404

    gate_query = db.query(GatePass)
    visitor_query = db.query(VisitorPass)
    material_query = db.query(MaterialPass)
    
    if user.role == 'employee':
        gate_query = gate_query.filter(GatePass.user_id == user_id)
        visitor_query = visitor_query.filter(VisitorPass.host_user_id == user_id)
        material_query = material_query.filter(MaterialPass.requested_by == user_id)
        
    status_filter = request.args.get('status')
    if status_filter == 'pending':
        gate_query = gate_query.filter(GatePass.status == 'pending')
        visitor_query = visitor_query.filter(VisitorPass.status == 'pending')
        material_query = material_query.filter(MaterialPass.status == 'pending')
    elif status_filter == 'history':
        gate_query = gate_query.filter(GatePass.status.in_(['approved', 'rejected', 'used']))
        visitor_query = visitor_query.filter(VisitorPass.status.in_(['approved', 'rejected']))
        material_query = material_query.filter(MaterialPass.status.in_(['approved', 'rejected']))
        
    gate_passes = gate_query.order_by(GatePass.request_date.desc()).limit(limit).all()
    visitor_passes = visitor_query.order_by(VisitorPass.request_date.desc()).limit(limit).all()
    material_passes = material_query.order_by(MaterialPass.request_date.desc()).limit(limit).all()
    
    merged = [p.to_dict() for p in gate_passes]
    
    for vp in visitor_passes:
        vp_dict = vp.to_dict()
        vp_dict['pass_type'] = 'visitor'
        vp_dict['pass_id'] = vp_dict['visitor_pass_id']
        vp_dict['employee_name'] = vp_dict['host_name'] # standardize field name
        # keep return_time None so it behaves similarly, exit_time is already expected_exit_time
        vp_dict['exit_time'] = vp_dict['expected_entry_time'] # use entry time as the primary time shown
        merged.append(vp_dict)
        
    for mp in material_passes:
        mp_dict = mp.to_dict()
        mp_dict['pass_type'] = 'material'
        mp_dict['pass_id'] = mp_dict['material_pass_id']
        mp_dict['employee_name'] = mp_dict['host_name']
        mp_dict['exit_time'] = mp_dict['expected_movement_time']
        merged.append(mp_dict)
        
    merged.sort(key=lambda x: x.get('request_date') or '', reverse=True)
    
    return jsonify(merged[:limit]), 200

@app.route('/api/passes', methods=['POST'])
@jwt_required()
def create_pass():
    user_id_str = get_jwt_identity()
    user_id = int(user_id_str) if str(user_id_str).isdigit() else user_id_str
    db = get_flask_db()
    
    user = db.query(User).filter_by(user_id=user_id).first()
    if not user:
        return jsonify({"message": "User not found"}), 404
        
    if user.role != 'employee':
        return jsonify({"message": "Forbidden: Only employees can request a gate pass"}), 403

    data = request.get_json()
    if not data:
        return jsonify({"message": "Invalid or missing JSON body"}), 400

    reason = data.get('reason', '').strip()
    exit_time_str = data.get('exit_time', '').strip()
    return_time_str = data.get('return_time', '').strip()

    if not reason or not exit_time_str or not return_time_str:
        return jsonify({"message": "Missing required fields: reason, exit_time, return_time"}), 400

    try:
        exit_time = datetime.fromisoformat(exit_time_str)
        return_time = datetime.fromisoformat(return_time_str)
    except ValueError:
        return jsonify({"message": "Invalid date format. Expected ISO format"}), 400

    now = datetime.now()
    if exit_time < now:
        return jsonify({"message": "Exit time cannot be in the past"}), 400
        
    if return_time <= exit_time:
        return jsonify({"message": "Return time must be after exit time"}), 400

    new_pass = GatePass(
        user_id=user.user_id,
        reason=reason,
        request_date=now.date(),
        exit_time=exit_time,
        return_time=return_time,
        status='pending'
    )
    # -- Verify in MySQL Workbench:
    # SELECT gp.pass_id, u.name, u.employee_id, gp.reason,
    #        gp.exit_time, gp.return_time, gp.status, gp.request_date
    # FROM gate_pass gp
    # JOIN user u ON gp.user_id = u.user_id
    # ORDER BY gp.request_date DESC
    # LIMIT 10;
    
    db.add(new_pass)
    db.commit()
    db.refresh(new_pass)
    
    # Return dict inline as requested
    pass_dict = {
        "pass_id": f"GP-2025-{new_pass.pass_id:04d}",
        "pass_type": user.role,
        "purpose": new_pass.reason,
        "request_date": new_pass.request_date.isoformat() if new_pass.request_date else None,
        "exit_time": new_pass.exit_time.isoformat() if new_pass.exit_time else None,
        "return_time": new_pass.return_time.isoformat() if new_pass.return_time else None,
        "status": new_pass.status,
        "approved_by": "—"
    }

    return jsonify(pass_dict), 201

@app.route('/api/visitor-passes', methods=['POST'])
@jwt_required()
def create_visitor_pass():
    user_id_str = get_jwt_identity()
    user_id = int(user_id_str) if str(user_id_str).isdigit() else user_id_str
    db = get_flask_db()
    
    user = db.query(User).filter_by(user_id=user_id).first()
    if not user:
        return jsonify({"message": "User not found"}), 404
        
    if user.role != 'employee':
        return jsonify({"message": "Forbidden: Only employees can request visitor passes"}), 403

    data = request.get_json()
    if not data or not data.get('visitor_name') or not data.get('visitor_contact') or not data.get('purpose') or not data.get('expected_entry_time') or not data.get('expected_exit_time'):
        return jsonify({"message": "Missing required fields"}), 400

    visitor_contact = data.get('visitor_contact').strip()
    if not re.match(r'^\d{10}$', visitor_contact):
        return jsonify({"message": "Visitor contact must be exactly 10 digits"}), 400

    try:
        expected_entry_time = datetime.fromisoformat(data.get('expected_entry_time'))
        expected_exit_time = datetime.fromisoformat(data.get('expected_exit_time'))
    except ValueError:
        return jsonify({"message": "Invalid date format. Expected ISO format"}), 400

    now = datetime.now()
    if expected_entry_time < now:
        return jsonify({"message": "Expected entry time cannot be in the past"}), 400
        
    if expected_exit_time <= expected_entry_time:
        return jsonify({"message": "Expected exit time must be after entry time"}), 400

    new_visitor_pass = VisitorPass(
        host_user_id=user.user_id,
        visitor_name=data.get('visitor_name').strip(),
        visitor_contact=visitor_contact,
        visitor_organization=data.get('visitor_organization', '').strip() or None,
        purpose=data.get('purpose').strip(),
        expected_entry_time=expected_entry_time,
        expected_exit_time=expected_exit_time,
        status='pending',
        request_date=now
    )
    
    db.add(new_visitor_pass)
    db.commit()
    db.refresh(new_visitor_pass)
    
    return jsonify(new_visitor_pass.to_dict()), 201


@app.route('/api/passes/<pass_id_str>/status', methods=['PUT'])
@jwt_required()
def update_pass_status(pass_id_str):
    user_id_str = get_jwt_identity()
    user_id = int(user_id_str) if str(user_id_str).isdigit() else user_id_str
    db = get_flask_db()
    
    user = db.query(User).filter_by(user_id=user_id).first()
    if not user:
        return jsonify({"message": "User not found"}), 404
        
    data = request.get_json()
    if not data or 'status' not in data:
        return jsonify({"message": "Invalid request, status is required"}), 400
        
    new_status = data['status']
    if new_status not in ['approved', 'rejected']:
        return jsonify({"message": "Invalid status value"}), 400

    try:
        # Extract integer ID from format like GP-2025-0001
        pass_id_int = int(pass_id_str.split('-')[-1])
    except (ValueError, IndexError):
        pass_id_int = pass_id_str

    gate_pass = db.query(GatePass).filter_by(pass_id=pass_id_int).first()
    if not gate_pass:
        return jsonify({"message": "Gate pass not found"}), 404
        
    is_admin = user.role in ['manager', 'admin']
    is_owner_cancelling = (str(gate_pass.user_id) == str(user.user_id)) and (new_status == 'rejected')
    
    if not (is_admin or is_owner_cancelling):
        return jsonify({"message": "Forbidden: You cannot update this pass status"}), 403
        
    if gate_pass.status != 'pending':
        return jsonify({"message": "Can only update pending passes"}), 400
        
    gate_pass.status = new_status
    if is_admin and new_status != 'rejected':
        gate_pass.approved_by = user.user_id
        gate_pass.approved_at = datetime.now()
    
    db.commit()
    db.refresh(gate_pass)
    return jsonify({"message": f"Pass status updated to {new_status}"}), 200

@app.route('/api/visitor-passes/<visitor_pass_id_str>/status', methods=['PUT'])
@jwt_required()
def update_visitor_pass_status(visitor_pass_id_str):
    user_id_str = get_jwt_identity()
    user_id = int(user_id_str) if str(user_id_str).isdigit() else user_id_str
    db = get_flask_db()
    
    user = db.query(User).filter_by(user_id=user_id).first()
    if not user:
        return jsonify({"message": "User not found"}), 404
        
    try:
        vp_id = int(visitor_pass_id_str.split('-')[-1])
    except ValueError:
        return jsonify({"message": "Invalid pass ID format"}), 400

    vpass = db.query(VisitorPass).filter_by(visitor_pass_id=vp_id).first()
    if not vpass:
        return jsonify({"message": "Visitor Pass not found"}), 404

    data = request.get_json()
    if not data or 'status' not in data:
        return jsonify({"message": "Missing status field"}), 400

    new_status = data['status']
    if new_status not in ['approved', 'rejected']:
        return jsonify({"message": "Invalid status value"}), 400
        
    is_admin = user.role in ['manager', 'admin']
    is_owner_cancelling = (str(vpass.host_user_id) == str(user.user_id)) and (new_status == 'rejected')
    
    if not (is_admin or is_owner_cancelling):
        return jsonify({"message": "Forbidden: You cannot update this pass status"}), 403

    if vpass.status != 'pending':
        return jsonify({"message": "Can only update pending passes"}), 400

    vpass.status = new_status
    if is_admin and new_status != 'rejected':
        vpass.approved_by = user.user_id
        vpass.approved_at = datetime.now()
    
    db.commit()
    return jsonify({"message": f"Visitor Pass status updated to {new_status}"}), 200

@app.route('/api/material-passes', methods=['POST'])
@jwt_required()
def create_material_pass():
    user_id_str = get_jwt_identity()
    user_id = int(user_id_str) if str(user_id_str).isdigit() else user_id_str
    db = get_flask_db()
    
    user = db.query(User).filter_by(user_id=user_id).first()
    if not user:
        return jsonify({"message": "User not found"}), 404
        
    if user.role != 'employee':
        return jsonify({"message": "Forbidden: Only employees can request material passes"}), 403

    data = request.get_json()
    if not data or not data.get('material_description') or not data.get('quantity') or not data.get('movement_direction') or not data.get('purpose') or not data.get('expected_movement_time'):
        return jsonify({"message": "Missing required fields"}), 400

    movement_direction = data.get('movement_direction')
    if movement_direction not in ['inward', 'outward']:
        return jsonify({"message": "Movement direction must be 'inward' or 'outward'"}), 400
        
    vehicle_involved = bool(data.get('vehicle_involved'))
    vehicle_number = data.get('vehicle_number', '').strip() if data.get('vehicle_number') else None
    
    if vehicle_involved and not vehicle_number:
        return jsonify({"message": "Vehicle number is required when a vehicle is involved"}), 400

    try:
        expected_movement_time = datetime.fromisoformat(data.get('expected_movement_time'))
    except ValueError:
        return jsonify({"message": "Invalid date format. Expected ISO format"}), 400

    now = datetime.now()
    if expected_movement_time < now:
        return jsonify({"message": "Expected movement time cannot be in the past"}), 400

    new_material_pass = MaterialPass(
        requested_by=user.user_id,
        material_description=data.get('material_description').strip(),
        quantity=data.get('quantity').strip(),
        movement_direction=movement_direction,
        vehicle_involved=vehicle_involved,
        vehicle_number=vehicle_number,
        purpose=data.get('purpose').strip(),
        expected_movement_time=expected_movement_time,
        status='pending',
        request_date=now
    )
    
    db.add(new_material_pass)
    db.commit()
    db.refresh(new_material_pass)
    
    return jsonify(new_material_pass.to_dict()), 201


@app.route('/api/material-passes/<material_pass_id_str>/status', methods=['PUT'])
@jwt_required()
def update_material_pass_status(material_pass_id_str):
    user_id_str = get_jwt_identity()
    user_id = int(user_id_str) if str(user_id_str).isdigit() else user_id_str
    db = get_flask_db()
    
    user = db.query(User).filter_by(user_id=user_id).first()
    if not user:
        return jsonify({"message": "User not found"}), 404
        
    try:
        mp_id = int(material_pass_id_str.split('-')[-1])
    except ValueError:
        return jsonify({"message": "Invalid pass ID format"}), 400

    mpass = db.query(MaterialPass).filter_by(material_pass_id=mp_id).first()
    if not mpass:
        return jsonify({"message": "Material Pass not found"}), 404
        
    data = request.get_json()
    if not data or 'status' not in data:
        return jsonify({"message": "Missing status field"}), 400

    new_status = data['status']
    if new_status not in ['approved', 'rejected']:
        return jsonify({"message": "Invalid status value"}), 400

    is_admin = user.role in ['manager', 'admin']
    is_owner_cancelling = (str(mpass.requested_by) == str(user.user_id)) and (new_status == 'rejected')
    
    if not (is_admin or is_owner_cancelling):
        return jsonify({"message": "Forbidden: You cannot update this pass status"}), 403

    if mpass.status != 'pending':
        return jsonify({"message": "Can only update pending passes"}), 400

    mpass.status = new_status
    if is_admin and new_status != 'rejected':
        mpass.approved_by = user.user_id
        mpass.approved_at = datetime.now()
    
    db.commit()
    return jsonify({"message": f"Material Pass status updated to {new_status}"}), 200


@app.route('/api/passes/<pass_id_str>', methods=['DELETE'])
@jwt_required()
def delete_gate_pass(pass_id_str):
    user_id_str = get_jwt_identity()
    user_id = int(user_id_str) if str(user_id_str).isdigit() else user_id_str
    db = get_flask_db()
    try:
        pass_id_int = int(pass_id_str.split('-')[-1])
    except (ValueError, IndexError):
        pass_id_int = pass_id_str
    gate_pass = db.query(GatePass).filter_by(pass_id=pass_id_int).first()
    if not gate_pass:
        return jsonify({"message": "Gate pass not found"}), 404
    if str(gate_pass.user_id) != str(user_id):
        return jsonify({"message": "Forbidden"}), 403
    if gate_pass.status != 'pending':
        return jsonify({"message": "Can only cancel pending passes"}), 400
    db.delete(gate_pass)
    db.commit()
    return jsonify({"message": "Pass deleted"}), 200

@app.route('/api/visitor-passes/<visitor_pass_id_str>', methods=['DELETE'])
@jwt_required()
def delete_visitor_pass(visitor_pass_id_str):
    user_id_str = get_jwt_identity()
    user_id = int(user_id_str) if str(user_id_str).isdigit() else user_id_str
    db = get_flask_db()
    try:
        vp_id = int(visitor_pass_id_str.split('-')[-1])
    except ValueError:
        return jsonify({"message": "Invalid ID format"}), 400
    vpass = db.query(VisitorPass).filter_by(visitor_pass_id=vp_id).first()
    if not vpass:
        return jsonify({"message": "Visitor Pass not found"}), 404
    if str(vpass.host_user_id) != str(user_id):
        return jsonify({"message": "Forbidden"}), 403
    if vpass.status != 'pending':
        return jsonify({"message": "Can only cancel pending passes"}), 400
    db.delete(vpass)
    db.commit()
    return jsonify({"message": "Visitor Pass deleted"}), 200

@app.route('/api/material-passes/<material_pass_id_str>', methods=['DELETE'])
@jwt_required()
def delete_material_pass(material_pass_id_str):
    user_id_str = get_jwt_identity()
    user_id = int(user_id_str) if str(user_id_str).isdigit() else user_id_str
    db = get_flask_db()
    try:
        mp_id = int(material_pass_id_str.split('-')[-1])
    except ValueError:
        return jsonify({"message": "Invalid ID format"}), 400
    mpass = db.query(MaterialPass).filter_by(material_pass_id=mp_id).first()
    if not mpass:
        return jsonify({"message": "Material Pass not found"}), 404
    if str(mpass.requested_by) != str(user_id):
        return jsonify({"message": "Forbidden"}), 403
    if mpass.status != 'pending':
        return jsonify({"message": "Can only cancel pending passes"}), 400
    db.delete(mpass)
    db.commit()
    return jsonify({"message": "Material Pass deleted"}), 200

from datetime import datetime

@app.route('/api/passes/lookup/<pass_id_str>', methods=['GET'])
@jwt_required()
def lookup_pass(pass_id_str):
    user_id_str = get_jwt_identity()
    user_id = int(user_id_str) if str(user_id_str).isdigit() else user_id_str
    claims = get_jwt()
    if claims.get('role') not in ['security', 'admin']:
        return jsonify({"message": "Forbidden"}), 403
    
    db = get_flask_db()
    prefix = pass_id_str.split('-')[0].upper()
    try:
        numeric_id = int(pass_id_str.split('-')[-1])
    except ValueError:
        return jsonify({"message": "Invalid Pass ID format"}), 400

    if prefix == 'GP':
        p = db.query(GatePass).filter_by(pass_id=numeric_id).first()
        if not p:
            return jsonify({"message": "Pass not found"}), 404
        d = p.to_dict()
        if getattr(p, 'activity', None):
            d['actual_exit_time'] = p.activity.actual_exit_time.isoformat() if p.activity.actual_exit_time else None
            d['actual_return_time'] = p.activity.actual_return_time.isoformat() if p.activity.actual_return_time else None
        else:
            d['actual_exit_time'] = None
            d['actual_return_time'] = None
        return jsonify(d), 200

    elif prefix == 'VP':
        p = db.query(VisitorPass).filter_by(visitor_pass_id=numeric_id).first()
        if not p:
            return jsonify({"message": "Pass not found"}), 404
        d = p.to_dict()
        d['pass_type'] = 'visitor'
        
        act = db.query(GateActivity).filter_by(pass_id_str=pass_id_str).first()
        d['is_verified'] = bool(act)
        if act:
            d['verification_time'] = act.verification_time.isoformat() if act.verification_time else None
            
        return jsonify(d), 200

    elif prefix == 'MP':
        p = db.query(MaterialPass).filter_by(material_pass_id=numeric_id).first()
        if not p:
            return jsonify({"message": "Pass not found"}), 404
        d = p.to_dict()
        d['pass_type'] = 'material'
        
        act = db.query(GateActivity).filter_by(pass_id_str=pass_id_str).first()
        d['is_verified'] = bool(act)
        if act:
            d['verification_time'] = act.verification_time.isoformat() if act.verification_time else None
            
        return jsonify(d), 200
        
    return jsonify({"message": "Unknown Pass Type"}), 400

@app.route('/api/gate-activity/log-exit', methods=['POST'])
@jwt_required()
def log_exit():
    user_id_str = get_jwt_identity()
    user_id = int(user_id_str) if str(user_id_str).isdigit() else user_id_str
    claims = get_jwt()
    if claims.get('role') not in ['security', 'admin']:
        return jsonify({"message": "Forbidden"}), 403
        
    data = request.json
    pass_id_str = data.get('pass_id', '')
    if not pass_id_str.startswith('GP-'):
        return jsonify({"message": "Can only log exit for Gate Passes (GP)"}), 400
        
    try:
        numeric_id = int(pass_id_str.split('-')[-1])
    except ValueError:
        return jsonify({"message": "Invalid Pass ID format"}), 400
        
    db = get_flask_db()
    p = db.query(GatePass).filter_by(pass_id=numeric_id).first()
    if not p:
        return jsonify({"message": "Pass not found"}), 404
    if p.status != 'approved':
        return jsonify({"message": "Pass is not approved"}), 400
        
    act = db.query(GateActivity).filter_by(pass_id=numeric_id).first()
    if not act:
        act = GateActivity(pass_id=numeric_id, actual_exit_time=datetime.now(), verified_by=user_id)
        db.add(act)
    else:
        if act.actual_exit_time:
            return jsonify({"message": "Exit already logged"}), 400
        act.actual_exit_time = datetime.now()
        act.verified_by = user_id
    db.commit()
    return jsonify({"message": "Exit logged successfully"}), 200

@app.route('/api/gate-activity/log-return', methods=['POST'])
@jwt_required()
def log_return():
    user_id_str = get_jwt_identity()
    user_id = int(user_id_str) if str(user_id_str).isdigit() else user_id_str
    claims = get_jwt()
    if claims.get('role') not in ['security', 'admin']:
        return jsonify({"message": "Forbidden"}), 403
        
    data = request.json
    pass_id_str = data.get('pass_id', '')
    if not pass_id_str.startswith('GP-'):
        return jsonify({"message": "Can only log return for Gate Passes (GP)"}), 400
        
    try:
        numeric_id = int(pass_id_str.split('-')[-1])
    except ValueError:
        return jsonify({"message": "Invalid Pass ID format"}), 400
        
    db = get_flask_db()
    act = db.query(GateActivity).filter_by(pass_id=numeric_id).first()
    if not act or not act.actual_exit_time:
        return jsonify({"message": "No exit logged for this pass"}), 400
    if act.actual_return_time:
        return jsonify({"message": "Return already logged"}), 400
        
    act.actual_return_time = datetime.now()
    db.commit()
    return jsonify({"message": "Return logged successfully"}), 200

@app.route('/api/gate-activity/verify', methods=['POST'])
@jwt_required()
def log_verify():
    user_id_str = get_jwt_identity()
    user_id = int(user_id_str) if str(user_id_str).isdigit() else user_id_str
    claims = get_jwt()
    if claims.get('role') not in ['security', 'admin']:
        return jsonify({"message": "Forbidden"}), 403
        
    data = request.json
    pass_id_str = data.get('pass_id', '')
    if not pass_id_str.startswith(('VP-', 'MP-')):
        return jsonify({"message": "Can only verify Visitor (VP) or Material (MP) passes"}), 400
        
    db = get_flask_db()
    
    # Check if already verified
    act = db.query(GateActivity).filter_by(pass_id_str=pass_id_str).first()
    if act:
        return jsonify({"message": "Pass already verified"}), 400
        
    pass_type = 'visitor' if pass_id_str.startswith('VP-') else 'material'
    act = GateActivity(
        pass_type=pass_type,
        pass_id_str=pass_id_str,
        verification_time=datetime.now(),
        verified_by=user_id
    )
    db.add(act)
    db.commit()
    return jsonify({"message": "Pass verified successfully"}), 200

@app.route('/api/gate-activity', methods=['GET'])
@jwt_required()
def get_gate_activity():
    claims = get_jwt()
    if claims.get('role') not in ['security', 'admin']:
        return jsonify({"message": "Forbidden"}), 403
        
    limit = request.args.get('limit', 20, type=int)
    db = get_flask_db()
    activities = db.query(GateActivity).order_by(GateActivity.log_id.desc()).limit(limit).all()
    
    res = []
    for a in activities:
        if a.pass_type == 'employee':
            p = a.gate_pass
            if not p: continue
            res.append({
                "log_id": a.log_id,
                "pass_id": f"GP-2025-{p.pass_id:04d}",
                "employee_name": p.requester.name if p.requester else "Unknown",
                "actual_exit_time": a.actual_exit_time.isoformat() if a.actual_exit_time else None,
                "actual_return_time": a.actual_return_time.isoformat() if a.actual_return_time else None,
                "verified_by": a.verifier.name if a.verifier else "Unknown"
            })
        else:
            # Visitor or Material
            res.append({
                "log_id": a.log_id,
                "pass_id": a.pass_id_str,
                "employee_name": "—", # Visitors/Materials don't use this column the same way in the simplified view
                "actual_exit_time": a.verification_time.isoformat() if a.verification_time else None,
                "actual_return_time": None,
                "verified_by": a.verifier.name if a.verifier else "Unknown"
            })
    return jsonify(res), 200

# =====================================================================
# ADMIN ENDPOINTS
# =====================================================================

@app.route('/api/admin/stats', methods=['GET'])
@jwt_required()
def get_admin_stats():
    claims = get_jwt()
    if claims.get('role') != 'admin':
        return jsonify({"message": "Forbidden"}), 403
        
    db = get_flask_db()
    
    total_users = db.query(User).count()
    
    total_gp = db.query(GatePass).count()
    total_vp = db.query(VisitorPass).count()
    total_mp = db.query(MaterialPass).count()
    total_passes = total_gp + total_vp + total_mp
    
    pending_gp = db.query(GatePass).filter_by(status='pending').count()
    pending_vp = db.query(VisitorPass).filter_by(status='pending').count()
    pending_mp = db.query(MaterialPass).filter_by(status='pending').count()
    pending_passes = pending_gp + pending_vp + pending_mp
    
    total_activity = db.query(GateActivity).count()
    
    return jsonify({
        "totalUsers": total_users,
        "totalPasses": total_passes,
        "pendingApprovals": pending_passes,
        "gateActivityLogs": total_activity
    }), 200

@app.route('/api/admin/users', methods=['GET'])
@jwt_required()
def get_admin_users():
    claims = get_jwt()
    if claims.get('role') != 'admin':
        return jsonify({"message": "Forbidden"}), 403
        
    db = get_flask_db()
    users = db.query(User).all()
    
    res = []
    for u in users:
        res.append({
            "user_id": u.user_id,
            "name": u.name,
            "email": u.email,
            "role": u.role,
            "department": u.department,
            "is_active": u.is_active if hasattr(u, 'is_active') else True
        })
    return jsonify(res), 200

@app.route('/api/admin/users', methods=['POST'])
@jwt_required()
def create_admin_user():
    claims = get_jwt()
    if claims.get('role') != 'admin':
        return jsonify({"message": "Forbidden"}), 403
        
    data = request.get_json()
    db = get_flask_db()
    
    if db.query(User).filter_by(email=data.get('email')).first():
        return jsonify({"message": "User with this email already exists"}), 400
        
    new_user = User(
        name=data.get('name'),
        email=data.get('email'),
        password=generate_password_hash(data.get('password')),
        role=data.get('role'),
        department=data.get('department', ''),
        is_active=True
    )
    db.add(new_user)
    db.commit()
    return jsonify({"message": "User created successfully"}), 201

@app.route('/api/admin/users/<int:user_id>', methods=['PUT'])
@jwt_required()
def update_admin_user(user_id):
    claims = get_jwt()
    if claims.get('role') != 'admin':
        return jsonify({"message": "Forbidden"}), 403
        
    db = get_flask_db()
    user = db.query(User).filter_by(user_id=user_id).first()
    if not user:
        return jsonify({"message": "User not found"}), 404
        
    data = request.get_json()
    if 'name' in data: user.name = data['name']
    if 'email' in data:
        existing = db.query(User).filter(User.email == data['email'], User.user_id != user_id).first()
        if existing:
            return jsonify({"message": "Email already in use"}), 400
        user.email = data['email']
    if 'role' in data: user.role = data['role']
    if 'department' in data: user.department = data['department']
    if 'password' in data and data['password'].strip():
        user.password = generate_password_hash(data['password'].strip())
        
    db.commit()
    return jsonify({"message": "User updated successfully"}), 200

@app.route('/api/admin/users/<int:user_id>', methods=['DELETE'])
@jwt_required()
def delete_admin_user(user_id):
    claims = get_jwt()
    if claims.get('role') != 'admin':
        return jsonify({"message": "Forbidden"}), 403
        
    db = get_flask_db()
    user = db.query(User).filter_by(user_id=user_id).first()
    if not user:
        return jsonify({"message": "User not found"}), 404
        
    if hasattr(user, 'is_active'):
        user.is_active = False
        db.commit()
    return jsonify({"message": "User deactivated successfully"}), 200

@app.route('/api/admin/users/<int:user_id>/reactivate', methods=['PUT'])
@jwt_required()
def reactivate_admin_user(user_id):
    claims = get_jwt()
    if claims.get('role') != 'admin':
        return jsonify({"message": "Forbidden"}), 403
        
    db = get_flask_db()
    user = db.query(User).filter_by(user_id=user_id).first()
    if not user:
        return jsonify({"message": "User not found"}), 404
        
    if hasattr(user, 'is_active'):
        user.is_active = True
        db.commit()
    return jsonify({
        "message": "User reactivated successfully", 
        "user": {
            "user_id": user.user_id,
            "name": user.name,
            "email": user.email,
            "role": user.role,
            "department": getattr(user, 'department', None),
            "is_active": getattr(user, 'is_active', True)
        }
    }), 200

@app.route('/api/admin/passes', methods=['GET'])
@jwt_required()
def get_admin_passes():
    claims = get_jwt()
    if claims.get('role') != 'admin':
        return jsonify({"message": "Forbidden"}), 403
        
    limit = request.args.get('limit', 100, type=int)
    db = get_flask_db()
    
    gate_query = db.query(GatePass)
    visitor_query = db.query(VisitorPass)
    material_query = db.query(MaterialPass)
    
    gate_passes = gate_query.order_by(GatePass.request_date.desc()).limit(limit).all()
    visitor_passes = visitor_query.order_by(VisitorPass.request_date.desc()).limit(limit).all()
    material_passes = material_query.order_by(MaterialPass.request_date.desc()).limit(limit).all()
    
    merged = [p.to_dict() for p in gate_passes]
    for vp in visitor_passes:
        vp_dict = vp.to_dict()
        vp_dict['pass_type'] = 'visitor'
        vp_dict['pass_id'] = vp_dict['visitor_pass_id']
        vp_dict['employee_name'] = vp_dict['host_name']
        vp_dict['exit_time'] = vp_dict['expected_entry_time']
        merged.append(vp_dict)
    for mp in material_passes:
        mp_dict = mp.to_dict()
        mp_dict['pass_type'] = 'material'
        mp_dict['pass_id'] = mp_dict['material_pass_id']
        mp_dict['employee_name'] = mp_dict['host_name']
        mp_dict['exit_time'] = mp_dict['expected_movement_time']
        merged.append(mp_dict)
        
    merged.sort(key=lambda x: x.get('request_date') or '', reverse=True)
    return jsonify(merged[:limit]), 200

@app.route('/api/admin/gate-activity', methods=['GET'])
@jwt_required()
def get_admin_gate_activity():
    claims = get_jwt()
    if claims.get('role') != 'admin':
        return jsonify({"message": "Forbidden"}), 403
        
    limit = request.args.get('limit', 100, type=int)
    db = get_flask_db()
    activities = db.query(GateActivity).order_by(GateActivity.log_id.desc()).limit(limit).all()
    
    res = []
    for a in activities:
        if a.pass_type == 'employee':
            p = a.gate_pass
            if not p: continue
            res.append({
                "log_id": a.log_id,
                "pass_id": f"GP-2025-{p.pass_id:04d}",
                "employee_name": p.requester.name if p.requester else "Unknown",
                "actual_exit_time": a.actual_exit_time.isoformat() if a.actual_exit_time else None,
                "actual_return_time": a.actual_return_time.isoformat() if a.actual_return_time else None,
                "verified_by": a.verifier.name if a.verifier else "Unknown"
            })
        else:
            res.append({
                "log_id": a.log_id,
                "pass_id": a.pass_id_str,
                "employee_name": "—",
                "actual_exit_time": a.verification_time.isoformat() if a.verification_time else None,
                "actual_return_time": None,
                "verified_by": a.verifier.name if a.verifier else "Unknown"
            })
    return jsonify(res), 200

if __name__ == '__main__':
    print("[IGPS] Starting server...")
    try:
        # Just to check if db works
        test_db = get_flask_db()
        test_db.execute(text("SELECT 1"))
        print("[IGPS] MySQL connected OK")
    except Exception as e:
        print(f"[!] Warning: Could not connect to database ({e})")
        
    local_ip = get_local_ip()
    print(f"[IGPS] Local access:   http://{local_ip}:5000")
    
    # Start ngrok thread
    threading.Thread(target=start_ngrok, daemon=True).start()
    
    # Run Flask
    # using use_reloader=False because otherwise it runs start_ngrok twice
    app.run(host='0.0.0.0', port=5000, debug=True, use_reloader=False)
