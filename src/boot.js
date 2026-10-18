// The editor script is classic (globals shared with the inline handlers), so it waits for the module that provides THREE.
const message = document.getElementById('bootMsg'), bar = document.querySelector('#boot .bar');
if (window.THREE) {
  I18n.init();
  const script = document.createElement('script');
  script.textContent = document.getElementById('app').textContent;
  document.body.append(script);
} else {
  message.textContent = 'No se pudo cargar el motor 3D. Revisa tu conexión y recarga la página.';
  bar.hidden = true;
}
