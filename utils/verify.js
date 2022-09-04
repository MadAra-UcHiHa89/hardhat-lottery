async function verify(contractAddress, constructorArgs) {
  console.log("Verifying contract ....");
  try {
    await run("verify:verify", {
      address: contractAddress,
      constructorArguments: constructorArgs,
    });

    console.log("Contract verified successfully");
  } catch (err) {
    if (err.message.toLowerCase().includes("already verified")) {
      console.log("Already verified");
    } else {
      console.log(err);
    }
  }
}
module.exports = { verify };
