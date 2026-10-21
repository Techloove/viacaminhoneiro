# Administração multiempresa

Cada transportadora tem sua organização, usuários, clientes, motoristas, veículos, viagens e configuração FazNota. O isolamento é lógico por organização com RLS no mesmo Supabase; não se cria um banco físico por CNPJ. Cada conexão usa o token da própria empresa. O certificado A1 e o cadastro fiscal devem estar configurados na respectiva conta do FazNota; o aplicativo não recebe arquivos de certificados nesta etapa.

O menu **Administração SaaS** permite cadastrar empresas, vincular um responsável já cadastrado no Supabase Auth, definir plano, mensalidade em reais, dia de vencimento e limites mensais separados de CT-e, CIOT e MDF-e. Campo de limite vazio significa ilimitado; zero bloqueia novas reservas. Valores de mensalidade são controles administrativos, sem débito automático ou integração de cobrança. Não há envio de convites nem criação de senhas pelo painel.

O administrador pode gerenciar conexões fiscais de empresas sem se tornar membro delas. Isso não concede acesso geral a clientes, viagens e documentos operacionais. Uma conta de administrador precisa ser ativada explicitamente no banco.

## Ativação no Supabase

1. No SQL Editor, execute primeiro `supabase/migrations/202610210006_faznota_connections.sql`, depois `supabase/migrations/202610210007_saas_administration.sql`. As migrações 001 a 005 precisam estar aplicadas; não repita migrações já executadas.
2. Abra `supabase/bootstrap/platform_admin.sql`, substitua apenas `SEU_EMAIL_DE_LOGIN` pelo e-mail da sua conta existente e execute no SQL Editor. Isso ativa o administrador do SaaS, não os usuários das transportadoras. Recarregue o aplicativo para aparecer **Administração SaaS**.
3. Publique a função de servidor abaixo. O frontend no Lovable sozinho não publica funções do Supabase.

## Publicar a função fiscal

Alternativa pelo painel Supabase: **Edge Functions → Deploy a new function → Via Editor**. Nome: `faznota-connection`. Use o conteúdo pronto de `deploy/faznota-connection.ts` como `index.ts`. Desative a verificação legada de JWT da função (equivalente a `verify_jwt=false` no arquivo de configuração). O próprio código obrigatoriamente valida o token de acesso pelo Supabase Auth (`getUser`) e verifica a permissão no banco antes de qualquer ação; a função não permite uso anônimo.

Alternativa com Supabase CLI autenticado:

```sh
supabase functions deploy faznota-connection --project-ref nlteuqcyatsdjcuacguq
```


As variáveis `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` são fornecidas pelo ambiente de servidor Supabase. Nunca coloque a chave de serviço no frontend, no Lovable ou no chat. O domínio permitido por padrão é `https://viacaminhoneiro.lovable.app`; para outro domínio, configure `FAZNOTA_ALLOWED_ORIGINS` no servidor com origens completas separadas por vírgula.

O arquivo único para o editor é gerado a partir das fontes por `node scripts/build-faznota-dashboard.mjs`. Não edite cópias separadamente.

## Conexão e emissão

Em **Integrações fiscais** ou na configuração de uma empresa no painel administrativo, informe o token individual. O token é armazenado no Supabase Vault e não pode ser lido pelo navegador. O teste faz somente uma consulta autenticada mínima ao FazNota e descarta os dados de clientes retornados. `/health` não é prova de autenticação. O teste não confirma titularidade do CNPJ, validade do certificado ou ambiente fiscal; essas informações precisam ser confirmadas com o fornecedor.

O ambiente permanece **não confirmado** até confirmação do FazNota. Nenhuma emissão está habilitada nesta entrega. Os limites têm funções de reserva e confirmação exclusivas do servidor, com bloqueio por plano e repetição sem dupla contagem. Elas deverão ser chamadas pelo futuro emissor fiscal; editar limites no painel não cria uma integração de emissão.

A referência FazNota consultada nesta implementação é a versão 3.13.0. O CIOT via FazNota está limitado a ETC com frota própria, RNTRC ativo e A1; TAC/equiparados exigem outro caminho com instituição de pagamento. Os esquemas publicados de CT-e/MDF-e ainda precisam de confirmação do fornecedor para uma emissão completa. Não use essas telas como autorização de transporte.

## Verificação

`npm test`, `npm run test:db`, TypeScript e build verificam a implementação local. Os testes PostgreSQL exercitam RLS, permissões administrativas, clientes, reservas idempotentes e limites. O Vault é simulado nesses testes; a criptografia e o funcionamento da função publicada precisam de validação no projeto Supabase real. Nenhuma migração ou função foi aplicada remotamente por este ambiente.
