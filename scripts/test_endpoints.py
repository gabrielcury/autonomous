import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient
from backend.main import app

def run_tests():
    client = TestClient(app)
    
    # 1. Status
    r1 = client.get('/api/status')
    print('1. GET /api/status -> Status:', r1.status_code, 'Health score:', r1.json().get('health_score'))
    assert r1.status_code == 200

    # 2. Containers
    r2 = client.get('/api/containers')
    print('2. GET /api/containers -> Status:', r2.status_code, 'Containers count:', len(r2.json()))
    assert r2.status_code == 200

    # 3. IaC Suite
    r3 = client.get('/api/iac/suite')
    print('3. GET /api/iac/suite -> Status:', r3.status_code, 'Generated files:', list(r3.json().get('files', {}).keys()))
    assert r3.status_code == 200

    # 4. Code Trace
    r4 = client.post('/api/code/trace', json={'container_name': 'aegis-sre', 'tech_stack': 'python'})
    print('4. POST /api/code/trace -> Status:', r4.status_code, 'Findings:', r4.json().get('findings_count'))
    assert r4.status_code == 200

    # 5. Frontend SPA
    r5 = client.get('/')
    print('5. GET / (Frontend SPA) -> Status:', r5.status_code, 'Length:', len(r5.text), 'Has root:', 'id="root"' in r5.text)
    assert r5.status_code == 200

    # 6. Backups
    r6 = client.get('/api/backups')
    print('6. GET /api/backups -> Status:', r6.status_code, 'Backups list count:', len(r6.json()))
    assert r6.status_code == 200

    # 7. Docker Diagnostic
    r7 = client.get('/api/docker/diagnostic')
    diag = r7.json()
    print('7. GET /api/docker/diagnostic -> Status:', r7.status_code, 'Connected:', diag.get('connected'), 'Engine:', diag.get('engine'), 'Summary:', diag.get('summary'))
    assert r7.status_code == 200
    assert 'probed_sockets' in diag
    assert 'summary' in diag

    print('\nALL 7 ENDPOINT AND FRONTEND INTEGRATION TESTS PASSED!')

if __name__ == '__main__':
    run_tests()
