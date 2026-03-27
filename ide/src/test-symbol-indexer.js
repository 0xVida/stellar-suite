// Simple test script to verify symbol indexer functionality
import { symbolIndexer } from './lib/symbolIndexer.js';

// Test data
const testFiles = [
  {
    name: 'lib.rs',
    type: 'file',
    content: `
pub struct Contract {
    pub owner: Address,
}

impl Contract {
    pub fn new(env: Env, owner: Address) -> Self {
        Contract { owner }
    }
    
    pub fn get_owner(&self) -> Address {
        self.owner.clone()
    }
}

pub enum Error {
    Unauthorized,
}

pub const ADMIN: Symbol = Symbol::new(&env, "ADMIN");
`
  }
];

// Test the indexer
console.log('Testing symbol indexer...');
symbolIndexer.indexFiles(testFiles).then(() => {
  const symbols = symbolIndexer.getAllSymbols();
  console.log('Found symbols:', symbols);
  
  // Test finding a specific symbol
  const contractDefs = symbolIndexer.findDefinition('Contract');
  console.log('Contract definitions:', contractDefs);
  
  const newDefs = symbolIndexer.findDefinition('new');
  console.log('new function definitions:', newDefs);
});
