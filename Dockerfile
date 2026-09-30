FROM python:3.12-slim

WORKDIR /app
COPY goalie /app/goalie
ENV PORT=8080

CMD ["python", "-m", "goalie"]
