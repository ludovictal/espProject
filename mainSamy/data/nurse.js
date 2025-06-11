// remplir la liste des patients
(async()=>{
  const res = await fetch('/api/nurse/patients');
  const patients = await res.json();
  const sel = document.getElementById('patient-select');
  patients.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = `${p.first_name} ${p.last_name}`;
    sel.append(opt);
  });
})();

document.getElementById('vitals-form').addEventListener('submit', async e => {
  e.preventDefault();
  const body = Object.fromEntries(new FormData(e.target).entries());
  await fetch('/api/nurse/vitals', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify(body)
  });
  alert('Donnée enregistrée');
  e.target.reset();
});
