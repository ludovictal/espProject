document.getElementById('login-form').addEventListener('submit', async e => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const body = Object.fromEntries(fd.entries());
  const res = await fetch('/api/auth/login', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify(body)
  });
  const data = await res.json();
  if (res.ok) {
    // redirige selon role
    if (data.role === 'nurse')  window.location = '/nurse.html';
    else if (data.role === 'doctor') window.location = '/doctor.html';
    else window.alert('Redirection patient non implémentée');
  } else alert(data.error);
});
