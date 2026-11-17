async function test() {
  try {
    // First login
    const loginRes = await fetch('http://localhost:4000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: 'alice', password: 'password123' })
    });
    const loginData = await loginRes.json();
    console.log('Login:', loginData.token ? 'OK' : 'FAILED');
    
    // Then get turn credentials
    const turnRes = await fetch('http://localhost:4000/api/turn-credentials', {
      headers: { 'Authorization': 'Bearer ' + loginData.token }
    });
    const turnData = await turnRes.json();
    console.log('TURN Credentials:', JSON.stringify(turnData, null, 2));
  } catch (e) {
    console.error('Error:', e.message);
  }
}
test();