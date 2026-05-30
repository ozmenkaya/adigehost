/**
 * Desteklenen entegrasyon sağlayıcıları ve alan tanımları.
 * Frontend bu tanımlara göre dinamik form üretir; backend doğrulama için kullanır.
 *
 * Yeni bir sağlayıcı eklemek için buraya bir kayıt ekleyin (+ ilgili servisi yazın).
 */
export interface ProviderField {
  key: string;
  label: string;
  type: 'text' | 'password' | 'number' | 'select' | 'boolean';
  secret?: boolean; // true → değer yanıtta maskelenir
  options?: string[]; // type === 'select' için
  placeholder?: string;
  required?: boolean;
}

export interface ProviderDef {
  key: string;
  label: string;
  category: 'vps' | 'hosting' | 'domain' | 'payment' | 'einvoice' | 'email' | 'ai';
  description: string;
  testable: boolean;
  fields: ProviderField[];
}

export const PROVIDERS: ProviderDef[] = [
  {
    key: 'hetzner',
    label: 'Hetzner Cloud',
    category: 'vps',
    description: 'VPS provisioning ve yönetimi',
    testable: true,
    fields: [
      { key: 'apiToken', label: 'API Token', type: 'password', secret: true, required: true },
    ],
  },
  {
    key: 'domainnameapi',
    label: 'DomainNameAPI (Atak Domain)',
    category: 'domain',
    description: 'Domain kayıt, yenileme, DNS (REST API — sunucu IP whitelist gerektirir)',
    testable: true,
    fields: [
      { key: 'resellerId', label: 'Bayi ID', type: 'text', required: true },
      { key: 'apiKey', label: 'API Anahtarı', type: 'password', secret: true, required: true },
      { key: 'testApiKey', label: 'Test API Anahtarı', type: 'password', secret: true },
      { key: 'testMode', label: 'Test Modu', type: 'boolean' },
    ],
  },
  {
    key: 'iyzico',
    label: 'İyzico',
    category: 'payment',
    description: 'Kredi kartı tahsilatı + kart saklama',
    testable: true,
    fields: [
      { key: 'apiKey', label: 'API Key', type: 'password', secret: true, required: true },
      { key: 'secretKey', label: 'Secret Key', type: 'password', secret: true, required: true },
      {
        key: 'baseUrl',
        label: 'Ortam',
        type: 'select',
        options: ['https://sandbox-api.iyzipay.com', 'https://api.iyzipay.com'],
        required: true,
      },
    ],
  },
  {
    key: 'edm',
    label: 'EDM Bilişim (E-Fatura)',
    category: 'einvoice',
    description: 'E-fatura / e-arşiv kesimi (SOAP)',
    testable: false,
    fields: [
      { key: 'username', label: 'Kullanıcı Adı', type: 'text', required: true },
      { key: 'password', label: 'Şifre', type: 'password', secret: true, required: true },
      { key: 'wsdlUrl', label: 'WSDL URL', type: 'text' },
      { key: 'testMode', label: 'Test Modu', type: 'boolean' },
    ],
  },
  {
    key: 'smtp',
    label: 'SMTP (E-posta)',
    category: 'email',
    description: 'Bildirim e-postaları',
    testable: true,
    fields: [
      { key: 'host', label: 'Sunucu', type: 'text', required: true },
      { key: 'port', label: 'Port', type: 'number', placeholder: '587', required: true },
      { key: 'secure', label: 'SSL (465)', type: 'boolean' },
      { key: 'user', label: 'Kullanıcı', type: 'text' },
      { key: 'pass', label: 'Şifre', type: 'password', secret: true },
      { key: 'from', label: 'Gönderen', type: 'text', placeholder: 'AdigeHost <no-reply@...>' },
    ],
  },
  {
    key: 'anthropic',
    label: 'Anthropic Claude',
    category: 'ai',
    description: 'AI ajan (ticket analizi, raporlama)',
    testable: false,
    fields: [
      { key: 'apiKey', label: 'API Key', type: 'password', secret: true, required: true },
      { key: 'model', label: 'Model', type: 'text', placeholder: 'claude-sonnet-4-5' },
    ],
  },
];

export function getProvider(key: string): ProviderDef | undefined {
  return PROVIDERS.find((p) => p.key === key);
}
