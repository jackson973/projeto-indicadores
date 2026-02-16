/**
 * Test script for cashflow alerts
 * Run with: node apps/server/test-alerts.js
 */

require('dotenv').config({ path: __dirname + '/.env' });
const cashflowRepo = require('./src/db/cashflowRepository');

async function testAlerts() {
  console.log('🧪 Testing cashflow alerts...\n');

  try {
    console.log('📊 Fetching alerts data...');
    const alertsData = await cashflowRepo.getAllBoxesAlerts();

    console.log('\n✅ Success! No date format errors.');
    console.log('\n📦 Results:');
    console.log(`   - Date: ${alertsData.today}`);
    console.log(`   - Boxes with alerts: ${alertsData.boxes.length}`);

    if (alertsData.boxes.length > 0) {
      console.log('\n📋 Alerts by box:');
      alertsData.boxes.forEach(({ box, overdueCount, upcomingCount, overdueTotal, upcomingTotal }) => {
        console.log(`\n   Box: ${box.name}`);
        console.log(`   - Overdue: ${overdueCount} items (R$ ${overdueTotal.toFixed(2)})`);
        console.log(`   - Upcoming: ${upcomingCount} items (R$ ${upcomingTotal.toFixed(2)})`);
      });
    } else {
      console.log('\n   ℹ️  No alerts found for today');
    }

    console.log('\n✅ Test completed successfully!\n');
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Test failed with error:');
    console.error(error);
    console.log('');
    process.exit(1);
  }
}

testAlerts();
