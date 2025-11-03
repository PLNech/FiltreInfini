/**
 * ML Classification Test Script
 *
 * Copy and paste this into the browser console while on the FiltreInfini manager page
 * to test the ML classification system.
 */

(async function testMLClassification() {
  console.log('🚀 Starting ML Classification Test...\n');

  // Step 1: Load the ML classifier
  console.log('📥 Step 1: Loading ML classifier...');

  try {
    // Import the classifier (works in browser module context)
    const { pipeline } = await import('/lib/ml-classifier.js');
    console.log('✅ ML classifier module loaded');
  } catch (error) {
    console.warn('⚠️ Using script tag context, classifier should already be loaded');
  }

  // Step 2: Create test tabs
  console.log('\n📋 Step 2: Creating test tabs...');

  const testTabs = [
    {
      id: 'test-1',
      title: 'Python Tutorial - Learn Python Programming',
      url: 'https://docs.python.org/3/tutorial/',
      domain: 'docs.python.org',
      lastUsed: Date.now() - 2 * 60 * 60 * 1000, // 2 hours ago
      inactive: false
    },
    {
      id: 'test-2',
      title: 'Buy iPhone 15 Pro - Apple Store',
      url: 'https://www.apple.com/shop/buy-iphone',
      domain: 'apple.com',
      lastUsed: Date.now() - 1 * 60 * 60 * 1000, // 1 hour ago
      inactive: false
    },
    {
      id: 'test-3',
      title: 'Gmail - Inbox',
      url: 'https://mail.google.com/mail/u/0/',
      domain: 'mail.google.com',
      lastUsed: Date.now() - 30 * 60 * 1000, // 30 min ago
      inactive: false
    },
    {
      id: 'test-4',
      title: 'Old Documentation Page',
      url: 'https://example.com/docs/old-api',
      domain: 'example.com',
      lastUsed: Date.now() - 30 * 24 * 60 * 60 * 1000, // 30 days ago
      inactive: true
    }
  ];

  console.log(`✅ Created ${testTabs.length} test tabs`);

  // Step 3: Test domain knowledge
  console.log('\n🧠 Step 3: Testing domain knowledge...');

  if (typeof DomainKnowledge !== 'undefined') {
    const stats = DomainKnowledge.getStats();
    console.log(`✅ Domain knowledge loaded: ${stats.totalDomains} domains`);
    console.log('   Categories:', Object.keys(stats.categories).join(', '));

    // Test some lookups
    const pythonHints = DomainKnowledge.getHints('docs.python.org');
    const gmailHints = DomainKnowledge.getHints('mail.google.com');
    console.log('   Python docs hints:', pythonHints);
    console.log('   Gmail hints:', gmailHints);
  } else {
    console.warn('⚠️ DomainKnowledge not available');
  }

  // Step 4: Test context features
  console.log('\n🔍 Step 4: Testing context features...');

  if (typeof ContextFeatures !== 'undefined') {
    const context = ContextFeatures.extractSessionContext(testTabs);
    console.log('✅ Session context extracted:');
    console.log('   Total tabs:', context.totalTabs);
    console.log('   Co-occurring domains:', context.coOccurringDomains);
    console.log('   Temporal pattern:', context.temporalPattern);
  } else {
    console.warn('⚠️ ContextFeatures not available');
  }

  // Step 5: Test ML classification (this will download the model!)
  console.log('\n🤖 Step 5: Testing ML classification...');
  console.log('⏳ This will download ~67MB model on first run (cached after)');
  console.log('   Please wait...\n');

  try {
    // Dynamically import the ML classifier
    const mlModule = await import('../lib/ml-classifier.js');
    const mlClassifier = mlModule.default || mlModule;

    // Load the model
    console.time('Model Loading Time');
    await mlClassifier.loadModel();
    console.timeEnd('Model Loading Time');
    console.log('✅ Model loaded successfully!\n');

    // Classify first test tab
    console.log('🔬 Classifying test tab: "' + testTabs[0].title + '"');
    console.time('Classification Time');

    const result = await mlClassifier.classifyTab(testTabs[0], null);

    console.timeEnd('Classification Time');
    console.log('\n📊 Classification Results:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // Show Intent
    console.log('\n🎯 Intent (Broder 2002):');
    result.classifications.intent.topK.forEach(item => {
      console.log(`   ${item.label}: ${(item.score * 100).toFixed(1)}%`);
    });

    // Show Status
    console.log('\n📌 Status (Tabs.do 2021):');
    result.classifications.status.topK.forEach(item => {
      console.log(`   ${item.label}: ${(item.score * 100).toFixed(1)}%`);
    });

    // Show Content Type
    console.log('\n📁 Content Type (WWW 2010):');
    result.classifications.contentType.topK.forEach(item => {
      console.log(`   ${item.label}: ${(item.score * 100).toFixed(1)}%`);
    });

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ Classification successful!');

    // Test batch classification
    console.log('\n🔬 Testing batch classification (all 4 tabs)...');
    console.time('Batch Classification Time');

    const batchResults = await mlClassifier.classifyBatch(testTabs, null);

    console.timeEnd('Batch Classification Time');
    console.log(`✅ Classified ${batchResults.length} tabs`);

    // Show summary
    console.log('\n📊 Batch Results Summary:');
    batchResults.forEach((result, i) => {
      const tab = testTabs[i];
      const topIntent = result.classifications.intent.topK[0];
      const topStatus = result.classifications.status.topK[0];
      console.log(`   ${i+1}. ${tab.title.substring(0, 40)}`);
      console.log(`      → ${topIntent.label} + ${topStatus.label}`);
    });

  } catch (error) {
    console.error('❌ ML Classification failed:', error);
    console.log('\n💡 Make sure you\'re on the manager page and transformers.js is installed');
  }

  // Step 6: Test feedback system
  console.log('\n💬 Step 6: Testing feedback system...');

  if (typeof feedback !== 'undefined') {
    await feedback.add(true, 'Test: ML classification working great!');
    await feedback.add(false, 'Test: This should be reference not to-read', 'reference');

    console.log('✅ Added 2 test feedback entries');
    console.log('   Run "feedback.dump()" to see them');

    const stats = feedback.getStats();
    console.log('   Stats:', stats);
  } else {
    console.warn('⚠️ Feedback API not available');
  }

  console.log('\n🎉 ML Classification Test Complete!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('\n💡 Next steps:');
  console.log('   - Try: feedback.dump()');
  console.log('   - Try: feedback.export()');
  console.log('   - Try classifying your real tabs once integrated!');
  console.log('\n');
})();
