from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from django.core.cache import cache
from datetime import date, timedelta
from .models import Project, Contributor, Task

class SustainabilityTrackerTests(APITestCase):
    
    def setUp(self):
        # Create test instances
        self.project_active = Project.objects.create(
            name="Solar Panels Installation",
            description="Install solar panels on hostel rooftop",
            location="Amritapuri Hostel A",
            status="Active"
        )
        self.project_completed = Project.objects.create(
            name="Waste Segregation Drive",
            description="Introduce color-coded trash cans",
            location="Amritapuri Campus",
            status="Completed"
        )
        self.contributor = Contributor.objects.create(
            name="Harish Jiji",
            email="harish@example.com",
            skills="Django, Python, HTML"
        )
        self.task_completed = Task.objects.create(
            assigned_to=self.contributor,
            title="Buy solar panels",
            description="Procure photovoltaic panels",
            due_date=date.today() - timedelta(days=2),
            is_completed=True
        )
        self.task_completed.projects.add(self.project_active)

        self.task_overdue = Task.objects.create(
            assigned_to=self.contributor,
            title="Install inverter mount",
            description="Build brackets for the central inverter",
            due_date=date.today() - timedelta(days=1),
            is_completed=False
        )
        self.task_overdue.projects.add(self.project_active)

        # Clear cache before each test
        cache.clear()

        # Set admin session details to pass IsAdminSession permissions
        session = self.client.session
        session['user_type'] = 'admin'
        session['user_id'] = 999
        session.save()

    # 1. Project API Tests
    def test_get_projects_list(self):
        url = reverse('project-list')
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # 2 projects created in setUp
        self.assertEqual(response.data['count'], 2)

    def test_filter_projects_by_status(self):
        url = reverse('project-list')
        response = self.client.get(url, {'status': 'Active'})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['count'], 1)
        self.assertEqual(response.data['results'][0]['name'], "Solar Panels Installation")

    # 2. Contributor API Tests
    def test_create_contributor_duplicate_email(self):
        url = reverse('contributor-list')
        payload = {
            "name": "Another Harish",
            "email": "harish@example.com",  # Duplicate email
            "skills": "Gardening"
        }
        response = self.client.post(url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('email', response.data)

    # 3. Task API Tests
    def test_task_overdue_flag(self):
        url = reverse('task-detail', kwargs={'pk': self.task_overdue.id})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data['is_overdue'])

        url_comp = reverse('task-detail', kwargs={'pk': self.task_completed.id})
        response_comp = self.client.get(url_comp)
        self.assertEqual(response_comp.status_code, status.HTTP_200_OK)
        # Even though due date is in the past, it's completed, so it shouldn't be overdue
        self.assertFalse(response_comp.data['is_overdue'])

    def test_filter_tasks_by_contributor(self):
        url = reverse('task-list')
        response = self.client.get(url, {'contributor': self.contributor.id})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['count'], 2)

    def test_filter_tasks_by_overdue(self):
        url = reverse('task-list')
        response = self.client.get(url, {'overdue': 'true'})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['count'], 1)
        self.assertEqual(response.data['results'][0]['title'], "Install inverter mount")

    # 4. Cache and Invalidation Tests
    def test_api_list_caching_and_invalidation(self):
        url = reverse('project-list')
        
        # First call loads database and caches it
        response_1 = self.client.get(url)
        self.assertEqual(response_1.status_code, status.HTTP_200_OK)
        
        # Modify database directly without signals (bypass signals by calling .update)
        Project.objects.filter(id=self.project_active.id).update(name="Directly Edited Name")
        
        # Second call should still fetch cached name
        response_2 = self.client.get(url)
        # The list has completed and active in descending created order, find the active one
        active_proj_cached = next(p for p in response_2.data['results'] if p['id'] == self.project_active.id)
        self.assertEqual(active_proj_cached['name'], "Solar Panels Installation")

        # Now, trigger signal invalidation by updating model through standard save()
        self.project_active.name = "Signals Updated Name"
        self.project_active.save()  # Triggers post_save signal

        # Third call should now load updated name (cache was invalidated)
        response_3 = self.client.get(url)
        active_proj_new = next(p for p in response_3.data['results'] if p['id'] == self.project_active.id)
        self.assertEqual(active_proj_new['name'], "Signals Updated Name")

    def test_project_due_date(self):
        url = reverse('project-list')
        payload = {
            "name": "New Project with Due Date",
            "description": "Test due date field",
            "location": "Online",
            "status": "Active",
            "due_date": "2026-12-31"
        }
        response = self.client.post(url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['due_date'], "2026-12-31")

    def test_task_m2m_projects(self):
        url = reverse('task-list')
        payload = {
            "projects": [self.project_active.id, self.project_completed.id],
            "title": "M2M Test Task",
            "description": "Task for multiple projects",
            "due_date": str(date.today()),
            "assigned_to": self.contributor.id,
            "is_completed": False
        }
        response = self.client.post(url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(len(response.data['projects']), 2)
        self.assertIn(self.project_active.id, response.data['projects'])
        self.assertIn(self.project_completed.id, response.data['projects'])
        self.assertEqual(response.data['project_name'], f"{self.project_active.name}, {self.project_completed.name}")

    def test_task_no_project(self):
        url = reverse('task-list')
        payload = {
            "projects": [],
            "title": "Standalone Task",
            "description": "Task with no project associated",
            "due_date": str(date.today()),
            "assigned_to": self.contributor.id,
            "is_completed": False
        }
        response = self.client.post(url, payload, format='json')
        self.assertEqual(len(response.data['projects']), 0)
        self.assertEqual(response.data['project_name'], "")

    def test_task_status_sync(self):
        task1 = Task.objects.create(
            title="Sync Task 1",
            description="Test status syncing",
            due_date=date.today(),
            is_completed=True,
            status="Active"
        )
        self.assertEqual(task1.status, "Completed")

        task1.is_completed = False
        task1.save()
        self.assertEqual(task1.status, "Active")

        task2 = Task.objects.create(
            title="Sync Task 2",
            description="Test status On Hold",
            due_date=date.today(),
            is_completed=False,
            status="On Hold"
        )
        self.assertEqual(task2.status, "On Hold")

    # 5. Auth and Role-Based Permissions Tests
    def test_admin_settings_and_auth(self):
        from django.contrib.auth.models import User
        admin_user = User.objects.create_superuser(username="admin_test", email="admin@test.com", password="SecureAdminPassword123")
        
        # Test Login
        login_url = reverse('auth_login')
        payload = {
            "user_type": "admin",
            "username": "admin_test",
            "password": "SecureAdminPassword123"
        }
        self.client.session.clear()
        response = self.client.post(login_url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(self.client.session.get('user_type'), 'admin')

        # Test Update settings - incorrect current password (should fail)
        settings_url = reverse('auth_update_settings')
        settings_payload = {
            "name": "Updated Admin Name",
            "email": "newadmin@test.com",
            "username": "admin_test_updated",
            "password": "NewSecurePassword123",
            "current_password": "WrongPassword"
        }
        response = self.client.post(settings_url, settings_payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

        # Test Update settings - missing current password (should fail)
        settings_payload = {
            "name": "Updated Admin Name",
            "email": "newadmin@test.com",
            "username": "admin_test_updated",
            "password": "NewSecurePassword123"
        }
        response = self.client.post(settings_url, settings_payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

        # Test Update settings - correct current password (should succeed)
        settings_payload = {
            "name": "Updated Admin Name",
            "email": "newadmin@test.com",
            "username": "admin_test_updated",
            "password": "NewSecurePassword123",
            "current_password": "SecureAdminPassword123"
        }
        response = self.client.post(settings_url, settings_payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        # Verify user attributes updated
        admin_user.refresh_from_db()
        self.assertEqual(admin_user.email, "newadmin@test.com")
        self.assertEqual(admin_user.username, "admin_test_updated")

    def test_contributor_first_login_and_restrictions(self):
        # Create contributor with hashed temp password
        from django.contrib.auth.hashers import make_password
        staff = Contributor.objects.create(
            name="Staff User",
            email="staff@test.com",
            password=make_password("TempPassword123"),
            is_temp_password=True,
            joined_date=date.today()
        )
        
        # Test Login with temporary password
        login_url = reverse('auth_login')
        payload = {
            "user_type": "staff",
            "email": "staff@test.com",
            "password": "TempPassword123"
        }
        self.client.session.clear()
        response = self.client.post(login_url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(self.client.session.get('user_type'), 'staff')
        
        # Check profile indicates temporary password setup is required
        me_url = reverse('auth_me')
        response = self.client.get(me_url)
        self.assertTrue(response.data['is_temp_password'])

        # Change temporary password and configure security answers
        change_url = reverse('auth_change_temp_password')
        change_payload = {
            "new_password": "NewSecurePassword123",
            "re_password": "NewSecurePassword123",
            "security_answer_1": "Lord of the Rings",
            "security_answer_2": "Max",
            "security_answer_3": "Amritapuri"
        }
        response = self.client.post(change_url, change_payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        staff.refresh_from_db()
        self.assertFalse(staff.is_temp_password)
        self.assertEqual(staff.security_answer_1, "lord of the rings") # hashed lowercase

        # Test Staff role restrictions on updating tasks
        task = Task.objects.create(
            assigned_to=staff,
            title="Clean solar panel",
            description="Use microfiber cloth",
            due_date=date.today(),
            is_completed=False,
            status="Active"
        )
        task.projects.add(self.project_active)

        # Attempt to change title (should be rejected/ignored for other fields, only status/is_completed allowed)
        task_url = reverse('task-detail', kwargs={'pk': task.id})
        update_payload = {
            "title": "Hacked Title",
            "is_completed": True,
            "status": "Completed"
        }
        response = self.client.put(task_url, update_payload, format='json')
        # Response should be 403 Forbidden because staff cannot modify non-status fields!
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        # Update only status and is_completed (should be successful)
        valid_payload = {
            "is_completed": True,
            "status": "Completed"
        }
        response = self.client.put(task_url, valid_payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        task.refresh_from_db()
        self.assertTrue(task.is_completed)
        self.assertEqual(task.status, "Completed")
        # Ensure title did not change
        self.assertEqual(task.title, "Clean solar panel")

    def test_admin_management_rules(self):
        from django.contrib.auth.models import User
        User.objects.all().delete()
        
        admin1 = User.objects.create_superuser(username="admin1", email="admin1@test.com", password="SecurePassword123")
        
        session = self.client.session
        session['user_type'] = 'admin'
        session['user_id'] = admin1.id
        session.save()

        # 1. List admins
        url = reverse('admin-list')
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['username'], "admin1")

        # 2. Attempt self-deletion when sole admin (should fail 400)
        delete_self_url = reverse('admin-detail', kwargs={'pk': admin1.id})
        response = self.client.delete(delete_self_url)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("You are the only administrator", response.data['detail'])

        # 3. Create second admin
        payload = {
            "username": "admin2",
            "email": "admin2@test.com",
            "password": "NewSecurePassword123",
            "re_password": "NewSecurePassword123"
        }
        response = self.client.post(url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(User.objects.filter(username="admin2", is_superuser=True).exists())
        admin2 = User.objects.get(username="admin2")

        # 4. Attempt to delete admin2 (other admin) (should fail 403)
        delete_other_url = reverse('admin-detail', kwargs={'pk': admin2.id})
        response = self.client.delete(delete_other_url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn("not allowed to delete other administrators", response.data['detail'])

        # 5. Delete self when admin2 is available (should succeed 200)
        response = self.client.delete(delete_self_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(User.objects.filter(id=admin1.id).exists())
        # Verify session flushed
        self.assertNotIn('user_id', self.client.session)



