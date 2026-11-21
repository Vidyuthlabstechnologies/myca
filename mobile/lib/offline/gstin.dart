const _alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

const gstStateNames = <String, String>{
  '01': 'Jammu And Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh', '05': 'Uttarakhand',
  '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh', '10': 'Bihar', '11': 'Sikkim',
  '12': 'Arunachal Pradesh', '13': 'Nagaland', '14': 'Manipur', '15': 'Mizoram', '16': 'Tripura', '17': 'Meghalaya',
  '18': 'Assam', '19': 'West Bengal', '20': 'Jharkhand', '21': 'Odisha', '22': 'Chattisgarh', '23': 'Madhya Pradesh',
  '24': 'Gujarat', '25': 'Daman And Diu', '26': 'Dadra And Nagar Haveli And Daman And Diu', '27': 'Maharashtra',
  '29': 'Karnataka', '30': 'Goa', '31': 'Lakshadweep', '32': 'Kerala', '33': 'Tamil Nadu', '34': 'Puducherry',
  '35': 'Andaman And Nicobar Islands', '36': 'Telangana', '37': 'Andhra Pradesh', '38': 'Ladakh', '97': 'Other Territory',
  '99': 'Centre Jurisdiction',
};

String normalGstin(String value) => value.replaceAll(RegExp(r'\s'), '').toUpperCase();

String? gstinProblem(String value) {
  final gstin = normalGstin(value);
  if (gstin.isEmpty) return null;
  if (gstin.length != 15) return 'A GSTIN has 15 characters; this one has ${gstin.length}.';
  if (!gstStateNames.containsKey(gstin.substring(0, 2))) return 'The GSTIN starts with ${gstin.substring(0, 2)}, which is not a GST state code.';
  if (!RegExp(r'^[A-Z]{5}[0-9]{4}[A-Z]$').hasMatch(gstin.substring(2, 12))) return 'Characters 3 to 12 of a GSTIN are the PAN, and these are not a PAN.';
  if (!RegExp(r'^[0-9A-Z]$').hasMatch(gstin[12]) || !RegExp(r'^[0-9A-Z]$').hasMatch(gstin[13])) return 'This GSTIN has a character that cannot be there.';
  var sum = 0;
  for (var i = 0; i < 14; i++) {
    final at = _alphabet.indexOf(gstin[i]);
    if (at < 0) return 'This GSTIN has a character that cannot be there.';
    final product = (i.isEven ? 1 : 2) * at;
    sum += product ~/ 36 + product % 36;
  }
  final expected = _alphabet[(36 - sum % 36) % 36];
  if (gstin[14] != expected) return 'The last character of this GSTIN does not match the rest. Check it with the customer.';
  return null;
}

String gstinState(String value) {
  final gstin = normalGstin(value);
  return gstin.length >= 2 ? gstin.substring(0, 2) : '';
}
