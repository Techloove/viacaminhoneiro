# Operação preparada → viagem de planejamento

## Ativação

Execute 202610210005_trip_planning.sql no SQL Editor após as migrações anteriores. Não reaplique 001–004. A migração cria trip_plans e o RPC create_trip_from_draft, além de chaves compostas para impedir vínculos entre empresas. Não altera o conteúdo de viagens existentes.

## Verificação funcional

1. Abra uma operação existente ou crie um rascunho novo. Preencha origem, destino, motorista, placa válida e frete positivo com até duas casas decimais. Os dados restantes podem continuar pendentes de preparação.
2. Vá à revisão e salve o progresso. Sem salvar, a conversão deve permanecer desabilitada.
3. Clique em Criar ou abrir viagem de planejamento. A aplicação deve abrir Viagens e mostrar o resumo. O status continua Rascunho, sem autorização para transporte.
4. Recarregue e use Ver viagem: o resumo e sua revisão de origem devem permanecer disponíveis.
5. Reabra o rascunho e repita a conversão. O sistema deve abrir a mesma viagem, sem adicionar uma segunda linha.
6. Altere a operação, salve e repita a ação. A viagem já criada deve continuar com a cópia original; o sistema não faz atualização silenciosa.
7. Verifique uma viagem antiga cadastrada diretamente: ela deve manter seus dados e informar que não há resumo do assistente vinculado.

## Permissões e integridade

- Apenas owner/manager/operator podem converter. Viewer consulta o resultado sem criar viagem.
- Usuário de B não pode converter rascunho de A nem consultar seu resumo.
- O backend confere a revisão para novas conversões e bloqueia a linha do rascunho durante a transação. Uma repetição após sucesso retorna a viagem já existente.
- Os clientes não têm INSERT/UPDATE/DELETE em trip_plans. O resumo é uma cópia de preparação; não é um protocolo ou documento fiscal autorizado.
- Frete é convertido para centavos no banco com numeric, sem arredondar um valor com precisão acima de duas casas.

## Limitações e estado de teste

Validação local executada em PostgreSQL em memória (PGlite), mais testes de interface e lógica. Não houve alteração administrativa no Supabase real pelo Codex. A migração 005 e o roteiro real dependem de execução no projeto do usuário.

Uma operação gera uma viagem; esta entrega não agrupa vários rascunhos ou várias NF-e. Não há sincronização posterior, liberação de saída, pagamento, autorização fiscal ou registro de entrega. Integrações FazNota e ANTT/CIOT permanecem pendentes dos contratos completos, credenciais seguras e homologação.
