const chai = require('chai');
const AWSXRay = require('aws-xray-sdk-core');
const sinon = require('sinon').createSandbox();
const { expect } = chai;
const dirtyChai = require('dirty-chai');
chai.use(dirtyChai);
const sinonChai = require('sinon-chai');
chai.use(sinonChai);
const mongoose = require('mongoose');
const xRayPlugin = require('../../lib');
const { xraySchema } = require('./xray-schema');
const { connect } = require('./mongo-connect');

describe('Aggregate middleware applied to schema', function () {
  let model;
  let segment;
  let ns;
  let xRayContext;

  before(async function () {
    xraySchema.plugin(xRayPlugin, { verbose: true });
    await connect();
    model = mongoose.model('xray', xraySchema);
  });

  beforeEach(async function () {
    segment = new AWSXRay.Segment('mongoose-xray-test');

    ns = AWSXRay.getNamespace();
    xRayContext = ns.createContext();
    ns.enter(xRayContext);
    AWSXRay.setSegment(segment);

    await model.insertMany([
      {
        type: 'testType',
        identifier: '1234567890',
        widgetCount: 1,
      },
      {
        type: 'testType2',
        identifier: '1234567891',
        widgetCount: 3,
      },
      {
        type: 'testType',
        identifier: '1234567892',
        widgetCount: 2,
      },
    ]);
  });

  afterEach(function () {
    segment.close();
    ns.exit(xRayContext);
  });

  it('should aggregate with plugin enabled', async function () {
    const addSubsegmentSpy = sinon.spy(segment, 'addNewSubsegment');
    const newDoc = await model.aggregate([
      {
        $group: {
          _id: '$type',
          total: {
            $sum: 'widgetCount',
          },
        },
      },
    ]);

    expect(newDoc.length).to.be.greaterThan(1);
    expect(addSubsegmentSpy).to.have.been.calledOnce();
    expect(addSubsegmentSpy.returnValues[0]).to.be.ok();
    const subsegment = addSubsegmentSpy.returnValues[0];
    expect(subsegment.name).to.equal('mongodb.aggregate');

    expect(subsegment.annotations.model).to.equal('xray');
    expect(subsegment.metadata.default.operation).to.equal('aggregate');
    expect(subsegment.metadata.default.aggregate).to.be.ok();
    expect(subsegment.isClosed()).to.equal(true);
  });
});
