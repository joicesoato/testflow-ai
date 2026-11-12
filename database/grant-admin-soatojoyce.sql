-- Concede perfil administrativo à conta de testes autorizada.
-- Execute somente no banco do ambiente de desenvolvimento/teste.
UPDATE usuarios
SET role = 'admin'
WHERE email = 'soatojoyce@gmail.com';

-- Confirmação: deve retornar exatamente uma conta com role = admin.
SELECT id, nome, email, role
FROM usuarios
WHERE email = 'soatojoyce@gmail.com';
