(function () {
  var raw = (location.pathname.split('/')[2] || '').toUpperCase().replace(/[^23456789ABCDEFGHJKMNPQRSTUVWXYZ]/g, '');
  if (raw.length !== 8) return;
  document.getElementById('code').textContent = raw;
  var play = document.getElementById('play');
  var base = play.getAttribute('data-play');
  if (base) play.href = base + encodeURIComponent('utm_source=referral&utm_medium=invite&utm_campaign=referral&utm_content=' + raw);
})();
