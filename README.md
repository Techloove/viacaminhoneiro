# Via Caminhoneiro

.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/7a534a95-85fa-412c-9663-21a827baba13).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```


## Base Via Caminhoneiro



Node.js 24 e Bun 1.4.3 foram utilizados na integração. O lockfile canônico é bun.lock.

```sh
bun install --frozen-lockfile
bun run dev -- --host 0.0.0.0 --port 5173
npm run build
```

Com VITE_DEMO_MODE=true, o aplicativo funciona como demonstração: viagens e leitura de XML ficam apenas na memória e são perdidas ao recarregar. Nenhuma emissão fiscal é executada. Hub e apuração financeira ainda não estão implementados.

## Supabase

1. Crie um projeto de homologação e aplique `supabase/migrations/202610210001_initial.sql` com as ferramentas de migração do Supabase ou SQL Editor.
2. Copie `.env.example` para `.env.local` e configure URL e chave pública/publishable do projeto. Nunca utilize service role no frontend.
3. Crie um usuário de teste no Supabase Auth. O login usa e-mail e senha; esta versão não inclui cadastro ou recuperação de senha.
4. Reinicie o Vite, entre e crie sua operação. Cadastre uma viagem, recarregue e confirme persistência.
5. Antes de produção, valide RLS com dois usuários de organizações diferentes. Usuário sem membership não deve listar viagens; viewer não pode inserir; driver não tem acesso nesta fase. Não habilite acesso de motorista até existir atribuição por viagem.

O esquema contém organizações, associações e viagens em rascunho. Não inclui ainda cadastro fiscal completo, arquivos persistentes, credenciais de provedores ou fila. A migração foi preparada mas não executada em um banco nesta sessão.

## Importação de NF-e

O XML é lido localmente, com limite de 2 MB e rejeição de DOCTYPE/ENTITY. A leitura extrai emitente, número e chave; não verifica assinatura digital, autorização, titularidade ou validade fiscal. Não envia dados ao fornecedor nem arquiva no Supabase.

## Integrações pendentes

O contrato FazNota analisado não especifica CIOT nem todos os campos/consultas de CT-e e MDF-e. Obter contrato completo e homologação antes de integrar emissões. Não inserir tokens fiscais em variáveis VITE_, que são públicas.

O projeto Lovable informado é https://lovable.dev/projects/7a534a95-85fa-412c-9663-21a827baba13. A integração de código usa a branch main do GitHub, preservando a estrutura TanStack Start e o histórico do Lovable. A publicação do site é gerenciada no Lovable.

## SaaS de transportadoras: operação de frete

A primeira audiência passa a ser transportadoras prestadoras de frete. Com Supabase configurado, o conteúdo operacional exige login e associação a uma organização; o modo público VITE_DEMO_MODE=true é apenas demonstração. O cadastro Minha transportadora salva dados em carrier_profiles, após aplicar também `supabase/migrations/202610210002_carrier_workflow.sql`. Somente owner/manager podem alterar o cadastro. A organização é a fronteira de acesso, não um campo livre de filtro.

A tela Operação de frete reúne NF-e → CT-e → CIOT → MDF-e. XML importado manualmente pode informar o CNPJ da transportadora; coincidência de cadastro não comprova acesso autorizado, autenticidade ou autorização SEFAZ. O certificado não envia notificações: a captura necessita de distribuição autorizada, NSU, monitoramento e tratamento das limitações do serviço. Isso ainda não está integrado. Não cadastrar certificado/senha no frontend.

A nova migração também prepara notas recebidas, operações e documentos confirmados com vínculos compostos por organização. Essas três tabelas são somente leitura para clientes autenticados; apenas backend autorizado poderá registrar confirmações reais. Não existe ainda endpoint de escrita, automação da cadeia fiscal ou fila de notificações. Uma NF-e não é tratada como autorização para emitir CT-e; exigências fiscais/credenciamento devem ser avaliados. CIOT pode depender de modalidade e contratante, e precisa ser registrado no prazo aplicável, sem assumir ordem universal.

Antes de disponibilizar a clientes: aplicar e testar migrações em homologação com duas organizações; validar isolamento de leitura/escrita e permissões; implementar captura autorizada e custódia de certificados; completar os contratos FazNota e credenciamento/parceiro CIOT. Notas locais não são armazenadas no banco e rascunhos fiscais continuam temporários.

## Conexão no Lovable

`src/lib/public-supabase-config.ts` contém a URL e a chave **publishable** do projeto escolhido. São configurações públicas do navegador, preservadas na sincronização via GitHub. Isso permite ao preview e ao build do Lovable exibir login mesmo sem variáveis configuradas no editor. Nenhuma senha ou chave administrativa foi incluída.

As variáveis VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY continuam disponíveis para substituir a configuração, sempre como um par. Para demonstração explícita, use VITE_DEMO_MODE=true. A autenticação e as políticas RLS continuam obrigatórias; a chave pública não dá acesso administrativo.
