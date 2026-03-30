import { getInboxEmailsAction, getTabCountsAction } from './src/actions/emailActions';
async function test() {
    const counts = await getTabCountsAction();
    console.log("Counts:", counts);

    const targetStage = 'LEAD'; 
    const result = await getInboxEmailsAction(1, 5, targetStage, 'ALL'); // 'ALL' or undefined for gmailAccountId
    console.log(`Results for ${targetStage}:`, result.emails?.length);
    if(result.emails?.length > 0) {
        console.log(result.emails[0].pipeline_stage);
    }
}
test().catch(console.error);
