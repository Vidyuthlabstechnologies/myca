(function () {
  var raw = (location.pathname.split('/')[2] || '').toUpperCase().replace(/[^23456789ABCDEFGHJKMNPQRSTUVWXYZ]/g, '');
  if (raw.length !== 8) return;
  document.getElementById('code').textContent = raw;
  var play = document.getElementById('play');
  if (play.getAttribute('data-play') !== 'listed') return;
  play.href = 'https://play.google.com/store/apps/details?id=com.mldynamic.myca&referrer=' + encodeURIComponent('utm_source=referral&utm_medium=invite&utm_campaign=referral&utm_content=' + raw);
})();
