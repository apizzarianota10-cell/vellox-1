-- Fotos dos produtos da loja "Sabores do Nordeste".
-- Só preenche produtos SEM foto (não troca foto que você já colocou).
-- Rodar no Supabase → SQL Editor, depois do cardapio_sabores_do_nordeste_v2.sql.
with fotos(nome, url) as (values
  ('Quentinha com 2 carnes', 'https://www.appvellox.online/lojas/saboresdonordeste/quentinha.jpg'),
  ('Quentinha', 'https://www.appvellox.online/lojas/saboresdonordeste/quentinha.jpg'),
  ('Carne de sol sertaneja', 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c6/BRUNO_LIMA_GASTRONOMIA_CARNE_DE_SOL_GRAVAT%C3%81_PE_%2840198041084%29.jpg/960px-BRUNO_LIMA_GASTRONOMIA_CARNE_DE_SOL_GRAVAT%C3%81_PE_%2840198041084%29.jpg'),
  ('Charque', 'https://images.pexels.com/photos/37017289/pexels-photo-37017289.jpeg?auto=compress&cs=tinysrgb&w=800'),
  ('Coxão mole', 'https://images.pexels.com/photos/36859450/pexels-photo-36859450.jpeg?auto=compress&cs=tinysrgb&w=800&h=800&fit=crop'),
  ('Cupim', 'https://images.unsplash.com/photo-1623174025518-b49000fb653d?w=800&q=80&auto=format&fit=crop'),
  ('Costela de porco', 'https://images.unsplash.com/photo-1544025162-d76694265947?w=800&q=80&auto=format&fit=crop'),
  ('Costela de boi', 'https://images.pexels.com/photos/29030327/pexels-photo-29030327.jpeg?auto=compress&cs=tinysrgb&w=800'),
  ('Alcatra', 'https://images.unsplash.com/photo-1546964124-0cce460f38ef?w=800&q=80&auto=format&fit=crop'),
  ('Contra filé', 'https://images.unsplash.com/photo-1683315446874-e6a629087ef8?w=800&q=80&auto=format&fit=crop'),
  ('Lombo', 'https://images.unsplash.com/photo-1580476262843-d5e9b687d4d4?w=800&q=80&auto=format&fit=crop'),
  ('Maminha', 'https://images.unsplash.com/photo-1608877907149-a206d75ba011?w=800&h=800&q=80&auto=format&fit=crop'),
  ('Fraldinha', 'https://images.unsplash.com/photo-1600891964092-4316c288032e?w=800&q=80&auto=format&fit=crop'),
  ('Carneiro', 'https://images.unsplash.com/photo-1734987052573-0fbe611842ae?w=800&q=80&auto=format&fit=crop'),
  ('Picanha', 'https://images.unsplash.com/photo-1558030006-450675393462?w=800&q=80&auto=format&fit=crop'),
  ('Buchada de bode', 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/de/Buchadas_de_bode_por_Raquel_de_Sousa_dos_Santos_%2801%29.jpg/960px-Buchadas_de_bode_por_Raquel_de_Sousa_dos_Santos_%2801%29.jpg'),
  ('Boi guisado com pirão', 'https://www.appvellox.online/lojas/saboresdonordeste/pirao.jpg'),
  ('Chambaril com pirão', 'https://upload.wikimedia.org/wikipedia/commons/e/e1/Ossobuco.jpg'),
  ('Rabada com pirão', 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/ed/Coda_alla_vaccinara-01.jpg/960px-Coda_alla_vaccinara-01.jpg'),
  ('Bode com pirão', 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1f/Goat_stew_with_papas_arrugadas%2C_Puntagorda%2C_La_Palma.jpg/960px-Goat_stew_with_papas_arrugadas%2C_Puntagorda%2C_La_Palma.jpg'),
  ('Sarapatel com pirão', 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/26/Sarapatel.jpg/960px-Sarapatel.jpg'),
  ('Lasanha', 'https://images.unsplash.com/photo-1709429790175-b02bb1b19207?w=800&q=80&auto=format&fit=crop'),
  ('Escondidinho de carne de sol e cupim', 'https://images.unsplash.com/photo-1696935257293-9ec4f03074a1?w=800&q=80&auto=format&fit=crop'),
  ('Macarronada', 'https://images.unsplash.com/photo-1622973536968-3ead9e780960?w=800&q=80&auto=format&fit=crop'),
  ('Torta salgada', 'https://images.unsplash.com/photo-1490556278693-b666672547a1?w=800&q=80&auto=format&fit=crop'),
  ('3 Panquecas', 'https://images.unsplash.com/photo-1771268494481-cc301a1b7505?w=800&q=80&auto=format&fit=crop'),
  ('Porção de salpicão', 'https://images.pexels.com/photos/29496093/pexels-photo-29496093.jpeg?auto=compress&cs=tinysrgb&w=800&h=800&fit=crop'),
  ('Filé à parmegiana', 'https://www.appvellox.online/lojas/saboresdonordeste/parmegiana.jpg'),
  ('Arrumadinho', 'https://www.appvellox.online/lojas/saboresdonordeste/arrumadinho.jpg'),
  ('Musse de limão', 'https://images.pexels.com/photos/30616908/pexels-photo-30616908.jpeg?auto=compress&cs=tinysrgb&w=800'),
  ('Musse de maracujá', 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/64/Mousse_de_maracuj%C3%A1.jpg/960px-Mousse_de_maracuj%C3%A1.jpg'),
  ('Bolo de pote', 'https://images.unsplash.com/photo-1590080874810-8180c3eb1016?w=800&h=800&q=80&auto=format&fit=crop'),
  ('Pudim', 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0a/Pudim_de_leite_%283544235183%29.jpg/960px-Pudim_de_leite_%283544235183%29.jpg'),
  ('Suco natural', 'https://images.unsplash.com/photo-1622597467836-f3285f2131b8?w=800&q=80&auto=format&fit=crop'),
  ('BEBIDAS', 'https://images.pexels.com/photos/29409114/pexels-photo-29409114.jpeg?auto=compress&cs=tinysrgb&w=800&h=800&fit=crop')
)
update public.produtos p
set imagem_url = f.url
from fotos f
where p.empresa_id = (select id from public.empresas where slug = 'saboresdonordeste')
  and lower(p.nome) = lower(f.nome)
  and (p.imagem_url is null or p.imagem_url = '')
returning p.categoria, p.nome;

-- Remove fotos que não condiziam com o prato (caso este arquivo já tenha sido rodado antes)
update public.produtos
set imagem_url = null
where empresa_id = (select id from public.empresas where slug = 'saboresdonordeste')
  and imagem_url in ('https://images.unsplash.com/photo-1625604087024-7fb428fc4626?w=800&q=80&auto=format&fit=crop', 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d0/M%C3%A3o_de_vaca_com_gr%C3%A3o.jpg/960px-M%C3%A3o_de_vaca_com_gr%C3%A3o.jpg');
