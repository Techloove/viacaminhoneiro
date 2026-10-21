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

## Assistente de preparação de frete

A tela **Operação de frete** agora tem cinco etapas: Carga, Participantes, Frete, Viagem/CIOT e Revisão. Uma NF-e importada sugere chave, participantes, cidades, peso, valor e descrição da carga; tudo exige revisão. A chave digitada manualmente não busca XML automaticamente. Apenas uma NF-e por rascunho nesta versão.

Para habilitar persistência, execute **somente a nova migração** `supabase/migrations/202610210003_freight_drafts.sql` no SQL Editor do projeto em que as migrações 001 e 002 já foram aplicadas. Depois clique em **Salvar rascunho** e recarregue: **Retomar uma operação** deve listar a referência e abrir na etapa salva. Não reaplique as migrações anteriores. Sem a terceira migração, a tela permite preparação, mas informa que não conseguiu gravar. Não confunda os rascunhos antigos da Central Fiscal com os novos rascunhos persistentes do assistente.

O salvamento é explícito, sem autosave ou cache de dados pessoais no navegador. Há proteção para sair com alterações não salvas. A listagem traz até 100 rascunhos recentes e busca local por referência/rota/chave. O RPC grava com revisão otimista, evitando sobrescrever outra sessão sem detectar conflito. Em caso de conflito, preserve os valores de sua edição, feche o assistente e atualize a lista para reabrir a versão atual. Ainda não há mesclagem automática ou exclusão de rascunhos.

A nova tabela tem leitura por RLS para owner/manager/operator/viewer da organização. A gravação usa função com verificação de associação e permissão owner/manager/operator; escrita direta e acesso anônimo são negados. O identificador da organização é conferido no servidor, inclusive em atualizações. A tabela guarda apenas preparação, sem estados de autorização fiscal.

Verificações desta entrega: testes de interface para importação, navegação sem perda de campos, salvar/reabrir, falhas de gravação e conflito; teste local das três migrações em PostgreSQL isolado com PGlite para isolamento, permissões e concorrência. Esses testes não substituem validar login e duas organizações no Supabase real após aplicar a migração.

A interface não calcula piso oficial, impostos ou frete líquido, não paga frete e não emite CT-e/CIOT/MDF-e. O XML original não é arquivado; os dados de preparação selecionados ficam no rascunho salvo. Cadastros reutilizáveis de motoristas/veículos estão descritos abaixo; a homologação fiscal permanece pendente.

Para repetir as verificações: `npm run test` (interface e lógica), `npm run test:db` (PostgreSQL isolado em memória, sem conexão ao Supabase), `./node_modules/.bin/tsc --noEmit` e `npm run build`.

## Motoristas, veículos e cadastro rápido

Aplique **somente** `supabase/migrations/202610210004_fleet_registry.sql` após as migrações 001–003. A página **Motoristas e veículos** oferece busca, edição, inativação e reativação. Não há exclusão de registros. Nome e CPF são obrigatórios para motorista; placa, tipo e eixos para veículo. CNH, validade, contato, RNTRC e proprietário podem ser complementados depois. CPF é validado também no banco; RNTRC/CNH não são consultados externamente.

Na etapa **Viagem e CIOT** do assistente, selecione um motorista, veículo de tração e implemento ativo. Os campos são copiados para o rascunho; não são referências dinâmicas que alteram operações passadas. Eixos são somados para tração/implemento cadastrados e devem ser revisados quando houver preenchimento manual ou composição adicional. Os botões **Cadastrar motorista aqui** e **Cadastrar veículo aqui** permitem incluir e usar o registro sem sair do frete. Salve o rascunho após preencher os dados.

As telas carregam até 1.000 registros de cada categoria por transportadora, com busca sobre esse conjunto. Owner, manager e operator podem cadastrar/editar/inativar; viewer apenas consulta. Inativos ficam disponíveis no cadastro mediante filtro, mas não nas seleções para novas operações. CPF e placa são únicos dentro da organização, podendo existir em empresas diferentes. RLS restringe leitura/escrita por membership; um trigger impede mover cadastros entre empresas. As cópias históricas nos rascunhos não são apagadas pela inativação.

`npm run test:db` passou com as quatro migrações em PostgreSQL local isolado: leitura e alteração entre empresas negadas, duplicidade por empresa, consulta sem escrita para viewer, acesso anônimo negado e revogação após remover membership. Isso não significa que contas de teste foram criadas no Supabase real; execute também o roteiro em `docs/frota-e-isolamento.md` após aplicar a quarta migração.

## Criar viagem a partir de operação salva

Aplique **somente** `supabase/migrations/202610210005_trip_planning.sql` após as migrações 001–004. Na revisão do assistente, salve o progresso e clique em **Criar ou abrir viagem de planejamento**. Para essa conversão, origem, destino, motorista, placa e frete positivo em reais com até duas casas decimais devem estar preenchidos. As demais pendências fiscais continuam visíveis e não são tratadas como resolvidas. Rascunhos continuam podendo ser salvos incompletos.

O RPC `create_trip_from_draft` verifica organização, papel e revisão, cria a viagem e a cópia da operação na mesma transação, e impede duas viagens para o mesmo rascunho. Repetir a ação devolve a viagem existente. Uma edição posterior do rascunho não atualiza silenciosamente o resumo da viagem criada.

A lista de Viagens tem ação **Ver viagem**, com carga, rota, motorista, composição, valor bruto, chave NF-e informada e pendências. As viagens antigas cadastradas diretamente continuam funcionando, sem resumo de operação vinculado. CT-e, CIOT e MDF-e permanecem sem confirmação externa; criar planejamento não autoriza saída, não registra pagamento e não encerra documentos.

`npm run test:db` agora aplica as cinco migrações em PostgreSQL isolado e verifica conversão sem duplicidade, valor em centavos, rejeição de revisão desatualizada, conservação do resumo original e acesso por organização. Depois da migração no projeto real, siga `docs/viagem-planejada.md`; os testes locais não confirmam a ativação no Supabase hospedado.
