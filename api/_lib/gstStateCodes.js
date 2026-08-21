// Official GST state/UT codes -- fixed nationally, not sourced from the DB.
const GST_STATE_CODES = {
  '01': 'Jammu and Kashmir',
  '02': 'Himachal Pradesh',
  '03': 'Punjab',
  '04': 'Chandigarh',
  '05': 'Uttarakhand',
  '06': 'Haryana',
  '07': 'Delhi',
  '08': 'Rajasthan',
  '09': 'Uttar Pradesh',
  10: 'Bihar',
  11: 'Sikkim',
  12: 'Arunachal Pradesh',
  13: 'Nagaland',
  14: 'Manipur',
  15: 'Mizoram',
  16: 'Tripura',
  17: 'Meghalaya',
  18: 'Assam',
  19: 'West Bengal',
  20: 'Jharkhand',
  21: 'Odisha',
  22: 'Chattisgarh',
  23: 'Madhya Pradesh',
  24: 'Gujarat',
  25: 'Daman and Diu',
  26: 'Dadra and Nagar Haveli and Daman and Diu',
  27: 'Maharashtra',
  28: 'Andhra Pradesh (Old)',
  29: 'Karnataka',
  30: 'Goa',
  31: 'Lakshadweep',
  32: 'Kerala',
  33: 'Tamil Nadu',
  34: 'Puducherry',
  35: 'Andaman and Nicobar Islands',
  36: 'Telangana',
  37: 'Andhra Pradesh',
  38: 'Ladakh',
  97: 'Other Territory',
  99: 'Centre Jurisdiction',
};

function stateNameForCode(code) {
  if (!code) return '';
  const key = String(code).trim().padStart(2, '0');
  const name = GST_STATE_CODES[key];
  return name ? `${name} (${key})` : String(code);
}

module.exports = { GST_STATE_CODES, stateNameForCode };
