window.ACD_API_BASE = location.protocol === 'file:'
  ? 'http://localhost:3000/api'
  : location.hostname === 'localhost' || location.hostname === '127.0.0.1'
  ? '/api'
  : 'https://bvjnhlpngqksrwggegbe.supabase.co/functions/v1/homecoming-api';
