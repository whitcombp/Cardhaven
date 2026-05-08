# Cardhaven
A custom way to view and interact with frosthaven / gloomhaven ability cards, now with microservices!

API:
 - /login: authentication service
 - /lobby: lobby for users to interact; kafka consumer
 - /card-service: gloomhaven card browser; card selections are kafka events
 - /flip-service: gloomhaven flip modifier browser; flips are kafka events
 - /stats-service: keeps track of all user navigation and kafka events
 - /admin-panel: displays collected stats; only accessible by admins through the login service

 Installation:
  - run docker compose up to build the needed services. Ensure a .env file exists with JWT_SECRET, DB_PASSWORD, and ADMIN_USERS (admin users should be a comma-separated string of username:password)