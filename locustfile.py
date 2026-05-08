from locust import HttpUser, task, between


class APIUser(HttpUser):
    wait_time = between(1, 3)  # Users wait 1-3 seconds between tasks

    @task
    def test_endpoint(self):
        self.client.get("/")
