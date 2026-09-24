# PostgreSQL for local development

Run commands in PowerShell from `C:\MIS\csmju-activity-system`.

This configuration uses PostgreSQL 17 for a local development database. Confirm
the team's required major version before creating application tables. The web
application still uses Mock Data; no Prisma schema or migration is introduced.

## Start

Open Docker Desktop and wait until its Linux engine is running.

```powershell
docker compose --env-file .env.docker config --quiet
docker compose --env-file .env.docker up -d --wait
docker compose --env-file .env.docker ps
docker compose --env-file .env.docker exec db psql -U csmju_dev -d csmju_activity -c "SELECT current_database(), version();"
```

## Connection details

- Host: `127.0.0.1`
- Port from Windows: `5433` (the container uses `5432`)
- Database: `csmju_activity`
- User: `csmju_dev`
- Password and a ready-to-use `DATABASE_URL`: local `.env.docker` file.

`.env.docker` is ignored by Git. Do not paste its contents into logs or commit it.
Compose reads it only when `--env-file .env.docker` is supplied. Next.js does not
automatically load this filename. Configure the app's environment during the
Prisma integration step, once the team's schema and Prisma version are agreed.
The image's initial user is a database superuser for local bootstrap; production
and the eventual application connection require appropriately limited roles.

## Stop without deleting data

```powershell
docker compose --env-file .env.docker stop
```

Data is stored in the named Docker volume. Do not use `down -v` or delete the
volume unless you intend to erase the database and have a backup.
Changing the password in the env file does not change credentials in an already
initialized database; do not delete a volume merely to change a password.

References: https://hub.docker.com/_/postgres and
https://docs.docker.com/compose/how-tos/environment-variables/variable-interpolation/
