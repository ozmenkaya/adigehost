import { useEffect, useState } from 'react';
import { api } from '../utils/api';

export interface Company {
  company_title?: string;
  company_vkn?: string;
  company_tax_office?: string;
  company_address?: string;
  company_city?: string;
  company_district?: string;
  company_postal_code?: string;
  company_email?: string;
  company_phone?: string;
}

/** Genel (public) şirket bilgilerini `/public/company`'den çeker. */
export function useCompany() {
  const [company, setCompany] = useState<Company>({});

  useEffect(() => {
    api
      .get('/public/company')
      .then((r) => setCompany(r.data.data ?? {}))
      .catch(() => {});
  }, []);

  return company;
}
