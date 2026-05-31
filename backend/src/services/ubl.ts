import { randomUUID } from 'node:crypto';
import { round2 } from '../utils/helpers';

/**
 * UBL-TR 1.2 fatura XML üretici (GİB e-Fatura / e-Arşiv).
 * EDM sunucu tarafında imzalar (mali mühür); imzasız UBL üretiriz.
 */

export interface UblParty {
  vknTckn: string; // 10 hane VKN veya 11 hane TCKN
  title: string; // ünvan veya ad soyad
  firstName?: string;
  lastName?: string;
  taxOffice?: string;
  address: string;
  district?: string; // ilçe
  city: string; // il
  postalCode?: string;
  country?: string; // "Türkiye"
  email?: string;
  phone?: string;
}

export interface UblLine {
  name: string;
  quantity: number;
  unitPrice: number; // KDV hariç birim fiyat
  vatRate: number; // %
}

export interface UblInvoiceInput {
  gibId: string; // 16 haneli fatura no (FAT2026000000001)
  uuid?: string;
  issueDate?: Date;
  profileId: 'EARSIVFATURA' | 'TICARIFATURA' | 'TEMELFATURA';
  currency?: string;
  supplier: UblParty;
  customer: UblParty;
  lines: UblLine[];
  note?: string;
}

function esc(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
const f2 = (n: number) => round2(n).toFixed(2);

function partyXml(tag: string, p: UblParty, isCustomer: boolean): string {
  const scheme = p.vknTckn.length === 11 ? 'TCKN' : 'VKN';
  // GİB Schematron: schemeID="TCKN" ise cac:Person zorunlu. Ad/soyad yoksa ünvandan türet.
  let personName = '';
  if (scheme === 'TCKN') {
    let fn = p.firstName ?? '';
    let ln = p.lastName ?? '';
    if (!fn) {
      const parts = (p.title || '').trim().split(/\s+/);
      ln = parts.length > 1 ? parts.pop()! : '';
      fn = parts.join(' ') || (p.title ?? '');
    }
    personName =
      `<cac:Person><cbc:FirstName>${esc(fn)}</cbc:FirstName>` +
      `<cbc:FamilyName>${esc(ln || fn)}</cbc:FamilyName></cac:Person>`;
  }
  return (
    `<${tag}><cac:Party>` +
    `<cbc:WebsiteURI/>` +
    `<cac:PartyIdentification><cbc:ID schemeID="${scheme}">${esc(p.vknTckn)}</cbc:ID></cac:PartyIdentification>` +
    (scheme === 'VKN'
      ? `<cac:PartyName><cbc:Name>${esc(p.title)}</cbc:Name></cac:PartyName>`
      : '') +
    `<cac:PostalAddress>` +
    `<cbc:StreetName>${esc(p.address)}</cbc:StreetName>` +
    `<cbc:CitySubdivisionName>${esc(p.district ?? '')}</cbc:CitySubdivisionName>` +
    `<cbc:CityName>${esc(p.city)}</cbc:CityName>` +
    (p.postalCode ? `<cbc:PostalZone>${esc(p.postalCode)}</cbc:PostalZone>` : '') +
    `<cac:Country><cbc:Name>${esc(p.country ?? 'Türkiye')}</cbc:Name></cac:Country>` +
    `</cac:PostalAddress>` +
    `<cac:PartyTaxScheme><cac:TaxScheme><cbc:Name>${esc(p.taxOffice ?? '')}</cbc:Name></cac:TaxScheme></cac:PartyTaxScheme>` +
    (p.email || p.phone
      ? `<cac:Contact>${p.phone ? `<cbc:Telephone>${esc(p.phone)}</cbc:Telephone>` : ''}${
          p.email ? `<cbc:ElectronicMail>${esc(p.email)}</cbc:ElectronicMail>` : ''
        }</cac:Contact>`
      : '') +
    personName +
    `</cac:Party>` +
    (isCustomer ? '' : '') +
    `</${tag}>`
  );
}

export function buildInvoiceUBL(input: UblInvoiceInput): { xml: string; uuid: string } {
  const uuid = input.uuid ?? randomUUID();
  const cur = input.currency ?? 'TRY';
  const date = input.issueDate ?? new Date();
  const issueDate = date.toISOString().slice(0, 10);
  const issueTime = date.toISOString().slice(11, 19);

  let lineExt = 0;
  let taxTotal = 0;
  const lineXml = input.lines
    .map((l, idx) => {
      const lineAmount = round2(l.quantity * l.unitPrice);
      const lineTax = round2((lineAmount * l.vatRate) / 100);
      lineExt = round2(lineExt + lineAmount);
      taxTotal = round2(taxTotal + lineTax);
      return (
        `<cac:InvoiceLine>` +
        `<cbc:ID>${idx + 1}</cbc:ID>` +
        `<cbc:InvoicedQuantity unitCode="C62">${l.quantity}</cbc:InvoicedQuantity>` +
        `<cbc:LineExtensionAmount currencyID="${cur}">${f2(lineAmount)}</cbc:LineExtensionAmount>` +
        `<cac:TaxTotal><cbc:TaxAmount currencyID="${cur}">${f2(lineTax)}</cbc:TaxAmount>` +
        `<cac:TaxSubtotal><cbc:TaxableAmount currencyID="${cur}">${f2(lineAmount)}</cbc:TaxableAmount>` +
        `<cbc:TaxAmount currencyID="${cur}">${f2(lineTax)}</cbc:TaxAmount>` +
        `<cbc:Percent>${l.vatRate}</cbc:Percent>` +
        `<cac:TaxCategory><cac:TaxScheme><cbc:Name>KDV</cbc:Name><cbc:TaxTypeCode>0015</cbc:TaxTypeCode></cac:TaxScheme></cac:TaxCategory>` +
        `</cac:TaxSubtotal></cac:TaxTotal>` +
        `<cac:Item><cbc:Name>${esc(l.name)}</cbc:Name></cac:Item>` +
        `<cac:Price><cbc:PriceAmount currencyID="${cur}">${f2(l.unitPrice)}</cbc:PriceAmount></cac:Price>` +
        `</cac:InvoiceLine>`
      );
    })
    .join('');

  const taxInclusive = round2(lineExt + taxTotal);

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" ` +
    `xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" ` +
    `xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2" ` +
    `xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2">` +
    // E-fatura UBL-TR zorunlu: imza için UBLExtensions (EDM sunucu tarafında imzalar).
    `<ext:UBLExtensions><ext:UBLExtension><ext:ExtensionContent/></ext:UBLExtension></ext:UBLExtensions>` +
    `<cbc:UBLVersionID>2.1</cbc:UBLVersionID>` +
    `<cbc:CustomizationID>TR1.2</cbc:CustomizationID>` +
    `<cbc:ProfileID>${input.profileId}</cbc:ProfileID>` +
    `<cbc:ID>${esc(input.gibId)}</cbc:ID>` +
    `<cbc:CopyIndicator>false</cbc:CopyIndicator>` +
    `<cbc:UUID>${uuid}</cbc:UUID>` +
    `<cbc:IssueDate>${issueDate}</cbc:IssueDate>` +
    `<cbc:IssueTime>${issueTime}</cbc:IssueTime>` +
    `<cbc:InvoiceTypeCode>SATIS</cbc:InvoiceTypeCode>` +
    (input.note ? `<cbc:Note>${esc(input.note)}</cbc:Note>` : '') +
    `<cbc:DocumentCurrencyCode>${cur}</cbc:DocumentCurrencyCode>` +
    `<cbc:LineCountNumeric>${input.lines.length}</cbc:LineCountNumeric>` +
    // UBL-TR zorunlu imza referansı (mali mühür EDM tarafından eklenir).
    `<cac:Signature>` +
    `<cbc:ID schemeID="VKN_TCKN">${esc(input.supplier.vknTckn)}</cbc:ID>` +
    `<cac:SignatoryParty>` +
    `<cac:PartyIdentification><cbc:ID schemeID="${input.supplier.vknTckn.length === 11 ? 'TCKN' : 'VKN'}">${esc(input.supplier.vknTckn)}</cbc:ID></cac:PartyIdentification>` +
    `<cac:PostalAddress><cbc:CitySubdivisionName>${esc(input.supplier.district ?? '')}</cbc:CitySubdivisionName><cbc:CityName>${esc(input.supplier.city)}</cbc:CityName><cac:Country><cbc:Name>Türkiye</cbc:Name></cac:Country></cac:PostalAddress>` +
    `</cac:SignatoryParty>` +
    `<cac:DigitalSignatureAttachment><cac:ExternalReference><cbc:URI>#Signature</cbc:URI></cac:ExternalReference></cac:DigitalSignatureAttachment>` +
    `</cac:Signature>` +
    partyXml('cac:AccountingSupplierParty', input.supplier, false) +
    partyXml('cac:AccountingCustomerParty', input.customer, true) +
    `<cac:TaxTotal><cbc:TaxAmount currencyID="${cur}">${f2(taxTotal)}</cbc:TaxAmount>` +
    `<cac:TaxSubtotal><cbc:TaxableAmount currencyID="${cur}">${f2(lineExt)}</cbc:TaxableAmount>` +
    `<cbc:TaxAmount currencyID="${cur}">${f2(taxTotal)}</cbc:TaxAmount>` +
    `<cac:TaxCategory><cac:TaxScheme><cbc:Name>KDV</cbc:Name><cbc:TaxTypeCode>0015</cbc:TaxTypeCode></cac:TaxScheme></cac:TaxCategory>` +
    `</cac:TaxSubtotal></cac:TaxTotal>` +
    `<cac:LegalMonetaryTotal>` +
    `<cbc:LineExtensionAmount currencyID="${cur}">${f2(lineExt)}</cbc:LineExtensionAmount>` +
    `<cbc:TaxExclusiveAmount currencyID="${cur}">${f2(lineExt)}</cbc:TaxExclusiveAmount>` +
    `<cbc:TaxInclusiveAmount currencyID="${cur}">${f2(taxInclusive)}</cbc:TaxInclusiveAmount>` +
    `<cbc:PayableAmount currencyID="${cur}">${f2(taxInclusive)}</cbc:PayableAmount>` +
    `</cac:LegalMonetaryTotal>` +
    lineXml +
    `</Invoice>`;

  return { xml, uuid };
}
