export interface Sep1Currency {
  code: string;
  issuer?: string;
  contract_id?: string;
  display_precision?: number;
  anchor_asset_type?: 'credit_alphanum4' | 'credit_alphanum12' | 'native' | 'other';
  desc?: string;
  image?: string;
  status?: 'live' | 'dead' | 'test' | 'private';
  name?: string;
}

export interface Sep1Metadata {
  currencies: Sep1Currency[];
}