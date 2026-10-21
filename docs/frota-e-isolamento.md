# Frota e isolamento entre transportadoras

## Ativação

Executar 202610210004_fleet_registry.sql no Supabase após as migrações anteriores. Não repetir 001–003. A nova migração cria carrier_drivers, carrier_vehicles, validação de CPF, políticas RLS e bloqueio de transferência de registros entre organizações. Ela não altera rascunhos existentes.

## Fluxo funcional

1. Entre com um owner/manager/operator e abra Motoristas e veículos.
2. Cadastre motorista com nome e CPF válido. CNH e demais informações podem ser preenchidas depois. Use dados de teste próprios/autorizados; não copie dados pessoais da gravação de referência.
3. Na aba Veículos, cadastre tração e, quando aplicável, implemento, com placas distintas e número de eixos.
4. Recarregue a página e confirme que ambos reaparecem.
5. Retome um rascunho existente e abra Viagem e CIOT. Selecione motorista/tração/implemento e confira os campos copiados. O total de eixos exige revisão operacional, sem validação ANTT automática.
6. Cadastre outro motorista diretamente pelo botão Cadastrar motorista aqui. Ao confirmar gravação, o assistente deve receber os dados sem perder a referência, carga ou participantes.
7. Salve o rascunho e recarregue para confirmar os valores.
8. Edite o cadastro original. A cópia já salva no rascunho deve permanecer inalterada.
9. Inative um registro. Ele não deve aparecer em novas seleções; a opção Mostrar inativos deve permitir localizá-lo e reativá-lo. Não deve haver exclusão de registros ou alterações em viagens antigas.

## Duas empresas no projeto real

Use duas contas distintas no Supabase Auth, cada uma associada apenas à própria organização. A não deve ser membro de B e vice-versa. Use sessões separadas de navegador ou saia antes de trocar usuário.

1. Na conta A, crie uma operação de teste e um motorista/veículo identificáveis como A; salve.
2. Entre na conta B. A lista de rascunhos e os cadastros de A não devem aparecer.
3. Cadastre dados próprios de B e salve. Volte a A: registros de B não devem aparecer.
4. No cliente de B, tentativas de leitura, INSERT em organization_id de A ou UPDATE de identificadores conhecidos de A devem ser negadas ou retornar zero linhas, conforme a operação. Um formulário filtrado sozinho não é evidência suficiente de isolamento.
5. Com viewer da empresa A, leitura é permitida, mas INSERT/UPDATE são negados. A interface pode exibir o formulário; o servidor deve impedir a gravação. Não habilitar driver como operador fiscal.
6. Remova membership de uma conta de teste pelo procedimento administrativo autorizado. As consultas seguintes não devem retornar dados e as tentativas de gravar devem falhar.

Este roteiro não foi executado em contas reais pela sessão do Codex: somente a chave pública está disponível, sem acesso administrativo ao Supabase.

## Teste automatizado local

`npm run test:db` cria PostgreSQL isolado em memória com PGlite, aplica as quatro migrações e usa usuários/organizações fictícios. Verifica RLS, CPF, unicidade por empresa, rejeição de escrita cruzada, viewer, anonimato, inativação, bloqueio de exclusão, transferência e revogação. Não se conecta ao projeto de produção.

Os testes de interface verificam validação, dados enviados com organization_id, cadastro rápido, busca de inativos, reativação, tratamento de duplicidade e preenchimento de composição sem perder outros campos. Consultas RNTRC, assinatura, certificado, validade jurídica e emissão fiscal continuam pendentes de integração externa.
