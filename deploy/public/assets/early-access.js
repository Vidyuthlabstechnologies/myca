(function () {
  var forms = document.querySelectorAll('form.early-access');
  for (var i = 0; i < forms.length; i += 1) {
    var form = forms[i];
    if (!/^https:\/\/[^\s"<>]+$/.test(form.getAttribute('action') || '')) continue;
    form.hidden = false;
    var off = document.getElementById(form.getAttribute('data-off'));
    if (off) off.hidden = true;
  }
})();
