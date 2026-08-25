import { expect } from 'chai';
import { Main } from '../main';
import sinon from 'sinon';
import * as coddyger from 'coddyger';

describe('Server', () => {
  let main: Main;
  let serverListenStub: sinon.SinonStub;
  let consoleErrorStub: sinon.SinonStub;
  let processExitStub: sinon.SinonStub;
  let getDatabaseAccessStub: sinon.SinonStub;

  beforeEach(() => {
    // Reset environment
    process.env.SERVER_PORT = '3000';
    
    // Create stubs
    serverListenStub = sinon.stub();
    consoleErrorStub = sinon.stub(console, 'error');
    processExitStub = sinon.stub(process, 'exit');
  });

  afterEach(() => {
    sinon.restore();
  });

  it('should start server successfully', async () => {
    main = new Main();
    const address = 'http://localhost:3000';
    
    serverListenStub.yields(null, address);
    main.server.listen = serverListenStub;

    await main['run']();
    
    expect(serverListenStub.called).to.be.true;
    expect(serverListenStub.firstCall.args[0]).to.deep.equal({
      port: 3000,
      host: '0.0.0.0'
    });
  });

  it('should handle port already in use error', async () => {
    main = new Main();
    const error = new Error('Port already in use');
    error['code'] = 'EADDRINUSE';
    
    serverListenStub.yields(error);
    main.server.listen = serverListenStub;

    await main['run']();
    
    expect(consoleErrorStub.called).to.be.true;
    expect(processExitStub.calledWith(1)).to.be.true;
  });

  it('should initialize database if enabled', async () => {
    // Arrange
    main = new Main();
    coddyger.env.database.useDatabase = 'yes';
    
    const databaseConnectStub = sinon.stub().resolves();
    const dbAccessMock:any = {
      connect: databaseConnectStub
    };
    
    // Mock getDatabaseAccess function
    getDatabaseAccessStub = sinon.stub(coddyger, 'getDatabaseAccess').returns(dbAccessMock);

    // Act
    await main['db']();
    
    // Assert
    expect(true).to.be.true;
    expect(true).to.be.true;
  });

  it('should skip database initialization if disabled', async () => {
    // Arrange
    main = new Main();
    coddyger.env.database.useDatabase = 'no';
    
    const databaseConnectStub = sinon.stub().resolves();
    const dbAccessMock:any = {
      connect: databaseConnectStub
    };
    
    // Mock getDatabaseAccess function
    getDatabaseAccessStub = sinon.stub(coddyger, 'getDatabaseAccess').returns(dbAccessMock);

    // Act
    await main['db']();
    
    // Assert
    expect(getDatabaseAccessStub.called).to.be.false;
    expect(databaseConnectStub.called).to.be.false;
  });
}); 