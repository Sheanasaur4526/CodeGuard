# CodeGuard C compiler service

Compiles and runs C with real gcc inside Docker.

    cd compiler-service
    docker compose up --build -d
    curl localhost:2000/health

Then set `COMPILER_API` in `public/student.js` to `http://localhost:2000/execute`
(or your server's public HTTPS URL). Set `ALLOWED_ORIGIN` to your site URL in production.
Firebase Hosting is HTTPS, so a deployed site needs an HTTPS compiler URL (e.g. behind Caddy/nginx or Cloud Run).
