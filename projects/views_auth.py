import re
from datetime import date
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.models import User
from django.contrib.auth.hashers import make_password, check_password
from django.db.models import Q
from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status
from .models import Contributor, AdminProfile
from .serializers import AdminSettingsSerializer, StaffSettingsSerializer

def validate_secure_password(password):
    if len(password) < 8:
        return False, "Password must be at least 8 characters long."
    
    letters = sum(1 for c in password if c.isalpha())
    if letters < 2:
        return False, "Password must contain at least 2 letters."
        
    if not any(c.isdigit() for c in password):
        return False, "Password must contain at least 1 number."
        
    if not any(c.isupper() for c in password):
        return False, "Password must contain at least 1 uppercase letter."
        
    if not any(c.islower() for c in password):
        return False, "Password must contain at least 1 lowercase letter."
        
    return True, ""


@api_view(['POST'])
def auth_login(request):
    user_type = request.data.get('user_type')
    password = request.data.get('password')
    
    if not user_type or not password:
        return Response({"detail": "User type and password are required."}, status=status.HTTP_400_BAD_REQUEST)
        
    if user_type == 'admin':
        username = request.data.get('username')
        if not username:
            return Response({"detail": "Username is required for admin login."}, status=status.HTTP_400_BAD_REQUEST)
            
        user = authenticate(request, username=username, password=password)
        if user is not None:
            login(request, user)
            request.session['user_type'] = 'admin'
            request.session['user_id'] = user.id
            
            # Check if profile has answers configured
            profile, _ = AdminProfile.objects.get_or_create(user=user)
            has_questions_set = bool(profile.security_answer_1 and profile.security_answer_2 and profile.security_answer_3)
            
            return Response({
                "user_type": "admin",
                "username": user.username,
                "email": user.email,
                "name": f"{user.first_name} {user.last_name}".strip() or user.username,
                "has_questions_set": has_questions_set,
                "is_temp_password": False
            })
        else:
            return Response({"detail": "Invalid admin username or password."}, status=status.HTTP_401_UNAUTHORIZED)
            
    elif user_type == 'staff':
        email = request.data.get('email')
        if not email:
            return Response({"detail": "Email is required for staff login."}, status=status.HTTP_400_BAD_REQUEST)
            
        try:
            contributor = Contributor.objects.get(email=email)
        except Contributor.DoesNotExist:
            return Response({"detail": "No staff registered with this email."}, status=status.HTTP_401_UNAUTHORIZED)
            
        if contributor.password and check_password(password, contributor.password):
            request.session['user_type'] = 'staff'
            request.session['user_id'] = contributor.id
            
            has_questions_set = bool(contributor.security_answer_1 and contributor.security_answer_2 and contributor.security_answer_3)
            
            return Response({
                "user_type": "staff",
                "email": contributor.email,
                "name": contributor.name,
                "skills": contributor.skills,
                "has_questions_set": has_questions_set,
                "is_temp_password": contributor.is_temp_password
            })
        else:
            return Response({"detail": "Invalid staff password."}, status=status.HTTP_401_UNAUTHORIZED)
            
    return Response({"detail": "Invalid user type."}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
def auth_logout(request):
    logout(request)
    request.session.flush()
    return Response({"detail": "Logged out successfully."})


@api_view(['GET'])
def auth_me(request):
    user_type = request.session.get('user_type')
    user_id = request.session.get('user_id')
    
    if not user_type or not user_id:
        return Response({"detail": "Not authenticated."}, status=status.HTTP_401_UNAUTHORIZED)
        
    if user_type == 'admin':
        try:
            user = User.objects.get(id=user_id)
            profile, _ = AdminProfile.objects.get_or_create(user=user)
            has_questions_set = bool(profile.security_answer_1 and profile.security_answer_2 and profile.security_answer_3)
            return Response({
                "user_type": "admin",
                "username": user.username,
                "email": user.email,
                "name": f"{user.first_name} {user.last_name}".strip() or user.username,
                "has_questions_set": has_questions_set,
                "is_temp_password": False
            })
        except User.DoesNotExist:
            request.session.flush()
            return Response({"detail": "User not found."}, status=status.HTTP_401_UNAUTHORIZED)
            
    elif user_type == 'staff':
        try:
            contributor = Contributor.objects.get(id=user_id)
            has_questions_set = bool(contributor.security_answer_1 and contributor.security_answer_2 and contributor.security_answer_3)
            return Response({
                "user_type": "staff",
                "email": contributor.email,
                "name": contributor.name,
                "skills": contributor.skills,
                "has_questions_set": has_questions_set,
                "is_temp_password": contributor.is_temp_password
            })
        except Contributor.DoesNotExist:
            request.session.flush()
            return Response({"detail": "Staff member not found."}, status=status.HTTP_410_GONE)
            
    return Response({"detail": "Invalid session state."}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
def auth_change_temp_password(request):
    user_type = request.session.get('user_type')
    user_id = request.session.get('user_id')
    
    if user_type != 'staff' or not user_id:
        return Response({"detail": "Only temporary staff logins can change temporary passwords."}, status=status.HTTP_403_FORBIDDEN)
        
    try:
        contributor = Contributor.objects.get(id=user_id)
    except Contributor.DoesNotExist:
        return Response({"detail": "Staff member not found."}, status=status.HTTP_400_BAD_REQUEST)
        
    if not contributor.is_temp_password:
        return Response({"detail": "Temporary password has already been changed."}, status=status.HTTP_400_BAD_REQUEST)
        
    new_password = request.data.get('new_password')
    re_password = request.data.get('re_password')
    ans_1 = request.data.get('security_answer_1')
    ans_2 = request.data.get('security_answer_2')
    ans_3 = request.data.get('security_answer_3')
    
    if not new_password or not re_password or not ans_1 or not ans_2 or not ans_3:
        return Response({"detail": "All fields are required."}, status=status.HTTP_400_BAD_REQUEST)
        
    if new_password != re_password:
        return Response({"detail": "Passwords do not match."}, status=status.HTTP_400_BAD_REQUEST)
        
    is_valid, msg = validate_secure_password(new_password)
    if not is_valid:
        return Response({"detail": msg}, status=status.HTTP_400_BAD_REQUEST)
        
    contributor.password = make_password(new_password)
    contributor.security_answer_1 = ans_1.strip().lower()
    contributor.security_answer_2 = ans_2.strip().lower()
    contributor.security_answer_3 = ans_3.strip().lower()
    contributor.is_temp_password = False
    contributor.save()
    
    return Response({"detail": "Password and security questions set successfully."})


@api_view(['POST'])
def auth_forgot_password(request):
    user_type = request.data.get('user_type')
    identity = request.data.get('identity')  # username for admin, email for staff
    ans_1 = request.data.get('security_answer_1')
    ans_2 = request.data.get('security_answer_2')
    ans_3 = request.data.get('security_answer_3')
    new_password = request.data.get('new_password')
    re_password = request.data.get('re_password')
    
    if not user_type or not identity or not ans_1 or not ans_2 or not ans_3 or not new_password or not re_password:
        return Response({"detail": "All fields are required."}, status=status.HTTP_400_BAD_REQUEST)
        
    if new_password != re_password:
        return Response({"detail": "Passwords do not match."}, status=status.HTTP_400_BAD_REQUEST)
        
    is_valid, msg = validate_secure_password(new_password)
    if not is_valid:
        return Response({"detail": msg}, status=status.HTTP_400_BAD_REQUEST)
        
    if user_type == 'admin':
        try:
            user = User.objects.get(username=identity)
            profile, _ = AdminProfile.objects.get_or_create(user=user)
        except User.DoesNotExist:
            return Response({"detail": "Invalid admin credentials or security answers."}, status=status.HTTP_400_BAD_REQUEST)
            
        # Verify security questions
        db_ans_1 = (profile.security_answer_1 or "").strip().lower()
        db_ans_2 = (profile.security_answer_2 or "").strip().lower()
        db_ans_3 = (profile.security_answer_3 or "").strip().lower()
        
        if (ans_1.strip().lower() == db_ans_1 and 
            ans_2.strip().lower() == db_ans_2 and 
            ans_3.strip().lower() == db_ans_3 and db_ans_1):
            
            user.set_password(new_password)
            user.save()
            
            # Log the user in
            login(request, user)
            request.session['user_type'] = 'admin'
            request.session['user_id'] = user.id
            
            return Response({"detail": "Password reset successfully. You are now logged in."})
        else:
            return Response({"detail": "Incorrect security answers."}, status=status.HTTP_400_BAD_REQUEST)
            
    elif user_type == 'staff':
        try:
            contributor = Contributor.objects.get(email=identity)
        except Contributor.DoesNotExist:
            return Response({"detail": "Invalid staff credentials or security answers."}, status=status.HTTP_400_BAD_REQUEST)
            
        # Verify security questions
        db_ans_1 = (contributor.security_answer_1 or "").strip().lower()
        db_ans_2 = (contributor.security_answer_2 or "").strip().lower()
        db_ans_3 = (contributor.security_answer_3 or "").strip().lower()
        
        if (ans_1.strip().lower() == db_ans_1 and 
            ans_2.strip().lower() == db_ans_2 and 
            ans_3.strip().lower() == db_ans_3 and db_ans_1):
            
            contributor.password = make_password(new_password)
            contributor.is_temp_password = False
            contributor.save()
            
            # Log the user in
            request.session['user_type'] = 'staff'
            request.session['user_id'] = contributor.id
            
            return Response({"detail": "Password reset successfully. You are now logged in."})
        else:
            return Response({"detail": "Incorrect security answers."}, status=status.HTTP_400_BAD_REQUEST)
            
    return Response({"detail": "Invalid user type."}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
def auth_update_settings(request):
    user_type = request.session.get('user_type')
    user_id = request.session.get('user_id')
    
    if not user_type or not user_id:
        return Response({"detail": "Not authenticated."}, status=status.HTTP_401_UNAUTHORIZED)
        
    if user_type == 'admin':
        try:
            user = User.objects.get(id=user_id)
            profile, _ = AdminProfile.objects.get_or_create(user=user)
        except User.DoesNotExist:
            return Response({"detail": "User not found."}, status=status.HTTP_400_BAD_REQUEST)
            
        serializer = AdminSettingsSerializer(data=request.data)
        if serializer.is_valid():
            data = serializer.validated_data
            
            # Check username uniqueness if changing
            new_username = data.get('username')
            password = data.get('password')
            current_password = data.get('current_password')
            
            # Verify current password if changing username or password
            if (new_username != user.username) or password:
                if not current_password:
                    return Response({"detail": "Current password is required to change username or password."}, status=status.HTTP_400_BAD_REQUEST)
                if not check_password(current_password, user.password):
                    return Response({"detail": "Incorrect current password."}, status=status.HTTP_400_BAD_REQUEST)

            if new_username != user.username and User.objects.filter(username=new_username).exists():
                return Response({"detail": "Username is already taken."}, status=status.HTTP_400_BAD_REQUEST)
                
            user.username = new_username
            user.email = data.get('email')
            
            # Split name into first and last name
            name_parts = data.get('name').split(' ', 1)
            user.first_name = name_parts[0]
            user.last_name = name_parts[1] if len(name_parts) > 1 else ''
            
            # Optional password change
            if password:
                is_valid, msg = validate_secure_password(password)
                if not is_valid:
                    return Response({"detail": msg}, status=status.HTTP_400_BAD_REQUEST)
                user.set_password(password)
                
            user.save()
            
            # Save security answers
            ans_1 = data.get('security_answer_1')
            ans_2 = data.get('security_answer_2')
            ans_3 = data.get('security_answer_3')
            
            if ans_1:
                profile.security_answer_1 = ans_1.strip().lower()
            if ans_2:
                profile.security_answer_2 = ans_2.strip().lower()
            if ans_3:
                profile.security_answer_3 = ans_3.strip().lower()
            profile.save()
            
            # Update user session since password change logs out default backends in django
            if password:
                login(request, user)
                
            return Response({"detail": "Settings updated successfully."})
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        
    elif user_type == 'staff':
        try:
            contributor = Contributor.objects.get(id=user_id)
        except Contributor.DoesNotExist:
            return Response({"detail": "Staff member not found."}, status=status.HTTP_400_BAD_REQUEST)
            
        serializer = StaffSettingsSerializer(data=request.data)
        if serializer.is_valid():
            data = serializer.validated_data
            
            new_email = data.get('email')
            if new_email != contributor.email and Contributor.objects.filter(email=new_email).exists():
                return Response({"detail": "Email is already in use by another staff member."}, status=status.HTTP_400_BAD_REQUEST)
                
            contributor.name = data.get('name')
            contributor.email = new_email
            contributor.skills = data.get('skills')
            
            # Optional password change
            password = data.get('password')
            current_password = data.get('current_password')
            if password:
                if not current_password:
                    return Response({"detail": "Current password is required to change password."}, status=status.HTTP_400_BAD_REQUEST)
                if not contributor.password or not check_password(current_password, contributor.password):
                    return Response({"detail": "Incorrect current password."}, status=status.HTTP_400_BAD_REQUEST)
                is_valid, msg = validate_secure_password(password)
                if not is_valid:
                    return Response({"detail": msg}, status=status.HTTP_400_BAD_REQUEST)
                contributor.password = make_password(password)
                contributor.is_temp_password = False
                
            # Optional security answers change
            ans_1 = data.get('security_answer_1')
            ans_2 = data.get('security_answer_2')
            ans_3 = data.get('security_answer_3')
            
            if ans_1:
                contributor.security_answer_1 = ans_1.strip().lower()
            if ans_2:
                contributor.security_answer_2 = ans_2.strip().lower()
            if ans_3:
                contributor.security_answer_3 = ans_3.strip().lower()
                
            contributor.save()
            return Response({"detail": "Settings updated successfully."})
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        
    return Response({"detail": "Invalid user type."}, status=status.HTTP_400_BAD_REQUEST)


from rest_framework import viewsets
from rest_framework.permissions import BasePermission

class IsAdminSession(BasePermission):
    def has_permission(self, request, view):
        return request.session.get('user_type') == 'admin'

class AdminViewSet(viewsets.ViewSet):
    """
    API endpoint for CRUD operations on Administrators.
    Only accessible by logged-in admin users.
    """
    permission_classes = [IsAdminSession]

    def list(self, request):
        admins = User.objects.filter(is_superuser=True).order_by('username')
        data = [{"id": a.id, "username": a.username, "email": a.email} for a in admins]
        return Response(data)

    def create(self, request):
        username = request.data.get('username')
        email = request.data.get('email')
        password = request.data.get('password')
        re_password = request.data.get('re_password')

        if not username or not email or not password or not re_password:
            return Response({"detail": "All fields are required."}, status=status.HTTP_400_BAD_REQUEST)

        if password != re_password:
            return Response({"detail": "Passwords do not match."}, status=status.HTTP_400_BAD_REQUEST)

        is_valid, msg = validate_secure_password(password)
        if not is_valid:
            return Response({"detail": msg}, status=status.HTTP_400_BAD_REQUEST)

        if User.objects.filter(username=username).exists():
            return Response({"detail": "Username is already taken."}, status=status.HTTP_400_BAD_REQUEST)

        if User.objects.filter(email=email).exists():
            return Response({"detail": "Email is already in use."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            User.objects.create_superuser(username=username, email=email, password=password)
            return Response({"detail": "Admin created successfully."}, status=status.HTTP_201_CREATED)
        except Exception as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)

    def destroy(self, request, pk=None):
        current_user_id = request.session.get('user_id')
        
        if current_user_id != int(pk):
            return Response({"detail": "Admins are not allowed to delete other administrators."}, status=status.HTTP_403_FORBIDDEN)

        other_admins_count = User.objects.filter(is_superuser=True).exclude(id=current_user_id).count()
        if other_admins_count == 0:
            return Response({
                "detail": "You are the only administrator. You must create another administrator before you can delete your account."
            }, status=status.HTTP_400_BAD_REQUEST)

        try:
            user = User.objects.get(id=current_user_id)
            user.delete()
            request.session.flush()
            return Response({"detail": "Account deleted successfully and logged out."})
        except User.DoesNotExist:
            return Response({"detail": "User not found."}, status=status.HTTP_404_NOT_FOUND)
