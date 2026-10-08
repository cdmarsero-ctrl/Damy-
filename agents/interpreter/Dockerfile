# Interpreter agent worker. One container serves many rooms: LiveKit
# dispatches each session to a worker, which runs it in a child process.
FROM python:3.13-slim

WORKDIR /agent
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY *.py ./

# Health/metrics HTTP server used by orchestrators to check the worker.
EXPOSE 8081
CMD ["python", "main.py", "start"]
