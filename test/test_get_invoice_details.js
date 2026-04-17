const {test} = require('tap');

const getInvoiceDetails = require('./../service/get_invoice_details');

test('rejects missing invoice', t => {
  return getInvoiceDetails({}, err => {
    t.same(err, [400, 'ExpectedInvoice']);
    t.end();
  });
});

test('rejects BOLT 12 offer (lno1...)', t => {
  return getInvoiceDetails({
    invoice: 'lno1pg257enxv4ezqcneype82um50ynhxgrwdajx283qfwdpl28qqmc78ymlvhmxcsywdk5wrjnj36jryg488qwlrnzyjczs',
  }, err => {
    t.same(err, [400, 'Bolt12OffersNotSupported']);
    t.end();
  });
});

test('rejects BOLT 12 invoice (lni1...)', t => {
  return getInvoiceDetails({
    invoice: 'lni1qqs9y0kke2dffc0h73tvr8xqqu5e5ptk8j7lfxt0p9puc8n',
  }, err => {
    t.same(err, [400, 'Bolt12InvoicesNotSupported']);
    t.end();
  });
});

test('rejects malformed BOLT 11 invoice', t => {
  return getInvoiceDetails({invoice: 'lnbc1not-a-real-invoice'}, err => {
    t.ok(Array.isArray(err));
    t.equal(err[0], 400);
    t.equal(err[1], 'DecodeInvoiceFailure');
    t.end();
  });
});

test('bolt12 prefix match is case-insensitive', t => {
  return getInvoiceDetails({invoice: 'LNO1abc'}, err => {
    t.same(err, [400, 'Bolt12OffersNotSupported']);
    t.end();
  });
});
