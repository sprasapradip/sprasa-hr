/** Nepal localisation data. */
export const PROVINCES = ['Koshi', 'Madhesh', 'Bagmati', 'Gandaki', 'Lumbini', 'Karnali', 'Sudurpashchim'];

/** Mobile 98/97/96 + 8 digits or a landline, optional +977. Mirrors the server rule. */
export const NEPAL_PHONE = /^(\+?977[-\s]?)?(9[678]\d{8}|0?\d{1,2}[-\s]?\d{6,7})$/;

export const WEEKDAYS = [
  { value: 7, label: 'Sunday', short: 'Sun' },
  { value: 1, label: 'Monday', short: 'Mon' },
  { value: 2, label: 'Tuesday', short: 'Tue' },
  { value: 3, label: 'Wednesday', short: 'Wed' },
  { value: 4, label: 'Thursday', short: 'Thu' },
  { value: 5, label: 'Friday', short: 'Fri' },
  { value: 6, label: 'Saturday', short: 'Sat' },
];
