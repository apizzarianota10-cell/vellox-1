-- Dashboard sai do menu principal por padrão (fica só em /perfil, protegido
-- pela mesma senha do financeiro) — cada empresa decide se quer ele de
-- volta no menu através desse campo.
alter table empresas add column if not exists mostrar_dashboard_menu boolean not null default false;
