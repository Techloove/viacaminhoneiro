# Critérios de verificação do assistente

## Ativação no Supabase

Aplicar 202610210003_freight_drafts.sql após 001 e 002. Não exige alterar políticas anteriores. Executar em homologação antes de disponibilizar aos clientes. Este arquivo não executa comandos ou cria contas.

## Persistência

Com um usuário owner da empresa A: criar operação, preencher referência e carga, avançar para participantes, salvar e recarregar. A lista deve apresentar o rascunho e permitir retomar na etapa salva com os mesmos valores. A importação manual deve preservar nomes, número da NF-e com zeros iniciais e chaves como texto. Nenhuma leitura do XML deve ser descrita como autorização SEFAZ.

Sem a nova migração ou em falha de gravação: dados editados devem permanecer na tela, o aviso de erro deve aparecer e não deve haver mensagem de sucesso.

## Isolamento

Criar usuário de empresa B; não deve listar rascunhos de A. Tentar ler/gravar identificador conhecido de A pelo cliente de B deve ser negado. Viewer de A pode consultar, mas não salvar. Usuário sem sessão não pode consultar nem invocar a função de gravação. Remover membership deve revogar acesso nas próximas consultas.

## Concorrência

Abrir o mesmo rascunho em duas sessões da mesma empresa. Salvar na primeira e depois na segunda. A segunda deve receber conflito, conservar os valores digitados e não sobrescrever a revisão mais recente. Fechar/atualizar a lista permite retomar a versão atual; não há mesclagem automática.

## Proteções de interface

Voltar entre etapas não apaga dados. Sair pela navegação com alterações pendentes pede confirmação. Salvar rascunho é permitido incompleto, mas a revisão aponta pendências básicas. Os botões de transmissão permanecem desabilitados independentemente de todos os campos estarem preenchidos. Documento importado de outra transportadora apresenta necessidade de revisão; o vínculo não é confirmado por autenticação externa.

## Limitações

Uma NF-e por rascunho, até 100 registros recentes na lista, salvamento manual e sem XML original no Storage. Cadastros rápidos reutilizáveis e integrações externas não fazem parte desta entrega. A sequência da interface não substitui regras legais de exigência e prazo do CIOT.
