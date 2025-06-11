// dashboard mensuel
(async()=>{
  const dash = await (await fetch('/api/doctor/dashboard')).json();
  document.getElementById('dashboard').innerHTML = dash
    .map(r=>`${r.first_name} ${r.last_name}: ${r.visits_last_month} visites`)
    .join('<br>');
  // liste vitals
  const vitals = await (await fetch('/api/doctor/vitals')).json();
  document.getElementById('vitals-list').innerHTML =
    vitals.map(v=>`[${v.taken_at}] Patient ${v.patient_id} – ${v.temperature}°C (`+v.nurse+')').join('<br>');
  // patients pour consultation
  const pts = await (await fetch('/api/doctor/patients')).json();
  const sel = document.getElementById('cons-patients');
  pts.forEach(p=> sel.add(new Option(`${p.first_name} ${p.last_name}`, p.id)));
})();

document.getElementById('consult-form').addEventListener('submit', async e => {
  e.preventDefault();
  const body = Object.fromEntries(new FormData(e.target).entries());
  await fetch('/api/doctor/consultations', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify(body)
  });
  alert('Consultation ajoutée');
  e.target.reset();
});
